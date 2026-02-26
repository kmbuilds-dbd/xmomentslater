# Bookmarklet + Save Endpoint + Tagging — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to save X posts via a browser bookmarklet with optional freeform tagging, and expose saved posts as an RSS feed.

**Architecture:** Iframe-based bookmarklet injects a `/bookmarklet` page onto x.com. That page shows a tag picker UI, then POSTs to `/api/x/save-post` which fetches the tweet via X API v2, parses it into structured blocks, and stores it in `saved_posts` with tags. A token-authenticated RSS endpoint at `/api/feed/[token]` serves saved posts as full-content RSS 2.0 XML for consumption by any RSS reader.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS), X API v2 (OAuth 2.0 user tokens), AES-256-GCM encryption (existing), Tailwind CSS 4 + shadcn/ui.

**Working directory:** `/Users/kunalmorparia/Documents/Script/claude_all/xmomentslater/.claude/worktrees/fervent-banzai`

---

## Task 1: Database Migration — `saved_posts` table

**Files:**
- Create: `supabase/migrations/002_saved_posts.sql`

**Step 1: Write the migration**

```sql
-- saved_posts: stores parsed X posts with optional freeform tags
create table saved_posts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  x_post_id text not null,
  x_post_url text not null,
  author_name text,
  author_handle text,
  posted_at timestamptz,
  saved_at timestamptz default now() not null,
  read_at timestamptz,
  tags text[] default '{}',
  raw_api_response jsonb,
  parsed_content jsonb,
  unique(user_id, x_post_id)
);

-- RLS: users can only access their own saved posts
alter table saved_posts enable row level security;

create policy "Users select own posts"
  on saved_posts for select
  using (auth.uid() = user_id);

create policy "Users insert own posts"
  on saved_posts for insert
  with check (auth.uid() = user_id);

create policy "Users update own posts"
  on saved_posts for update
  using (auth.uid() = user_id);

create policy "Users delete own posts"
  on saved_posts for delete
  using (auth.uid() = user_id);

-- Indexes
create index idx_saved_posts_user_id on saved_posts(user_id);
create index idx_saved_posts_tags on saved_posts using gin(tags);
```

**Step 2: Apply the migration**

Run the SQL in the Supabase dashboard SQL editor (project doesn't use Supabase CLI locally).

**Step 3: Commit**

```bash
git add supabase/migrations/002_saved_posts.sql
git commit -m "feat: add saved_posts table migration with RLS and GIN index on tags"
```

---

## Task 2: URL Parser Utility

**Files:**
- Create: `src/lib/parser/url.ts`

**Step 1: Write the URL parser**

Extracts a tweet ID from various x.com/twitter.com URL formats.

```typescript
/**
 * Extract tweet ID from an X/Twitter URL.
 * Handles: x.com, twitter.com, with/without www, with query params and trailing slashes.
 * Returns null if the URL doesn't match a valid post URL pattern.
 */
export function extractPostId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    if (hostname !== "x.com" && hostname !== "twitter.com") {
      return null;
    }
    // Pattern: /{user}/status/{id}
    const match = parsed.pathname.match(/^\/[^/]+\/status\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/parser/url.ts
git commit -m "feat: add URL parser to extract tweet ID from x.com/twitter.com URLs"
```

---

## Task 3: X API Tweet Fetcher

**Files:**
- Create: `src/lib/parser/fetch-tweet.ts`

**Step 1: Write the tweet fetcher**

Calls X API v2 to fetch a tweet with author and media expansions using the user's OAuth token.

```typescript
export interface XApiTweetResponse {
  data: {
    id: string;
    text: string;
    created_at: string;
    author_id: string;
    entities?: {
      urls?: Array<{ start: number; end: number; expanded_url: string; display_url: string }>;
      mentions?: Array<{ start: number; end: number; username: string }>;
    };
    note_tweet?: {
      text: string;
      entities?: {
        urls?: Array<{ start: number; end: number; expanded_url: string; display_url: string }>;
        mentions?: Array<{ start: number; end: number; username: string }>;
      };
    };
    attachments?: { media_keys?: string[] };
  };
  includes?: {
    users?: Array<{ id: string; name: string; username: string; profile_image_url?: string }>;
    media?: Array<{ media_key: string; type: string; url?: string; preview_image_url?: string; width?: number; height?: number }>;
  };
}

const X_TWEETS_URL = "https://api.x.com/2/tweets";

export async function fetchTweet(postId: string, accessToken: string): Promise<XApiTweetResponse> {
  const params = new URLSearchParams({
    "tweet.fields": "text,created_at,author_id,entities,note_tweet,attachments",
    expansions: "author_id,attachments.media_keys",
    "user.fields": "name,username,profile_image_url",
    "media.fields": "url,preview_image_url,type,width,height",
  });

  const res = await fetch(`${X_TWEETS_URL}/${postId}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`X API fetch failed (${res.status}): ${err}`);
  }

  return res.json();
}
```

**Step 2: Commit**

```bash
git add src/lib/parser/fetch-tweet.ts
git commit -m "feat: add X API v2 tweet fetcher with author and media expansions"
```

---

## Task 4: Content Parser — Tweet to Structured Blocks

**Files:**
- Create: `src/lib/parser/parse-tweet.ts`

**Step 1: Write the parser**

Transforms a raw X API response into structured content blocks.

```typescript
import type { XApiTweetResponse } from "./fetch-tweet";

export interface ParsedContent {
  author: string;
  handle: string;
  profileImageUrl?: string;
  date: string;
  blocks: Array<{ type: "text" | "image"; content: string }>;
}

export function parseTweet(raw: XApiTweetResponse): ParsedContent {
  const author = raw.includes?.users?.find((u) => u.id === raw.data.author_id);

  // Prefer note_tweet.text for long posts / X Notes, fall back to data.text
  let text = raw.data.note_tweet?.text ?? raw.data.text;

  // Resolve shortened URLs in text
  const entities = raw.data.note_tweet?.entities ?? raw.data.entities;
  if (entities?.urls) {
    // Replace from end to start so indices stay valid
    const sorted = [...entities.urls].sort((a, b) => b.start - a.start);
    for (const urlEntity of sorted) {
      text =
        text.slice(0, urlEntity.start) +
        urlEntity.expanded_url +
        text.slice(urlEntity.end);
    }
  }

  const blocks: ParsedContent["blocks"] = [];

  // Text block
  if (text.trim()) {
    blocks.push({ type: "text", content: text.trim() });
  }

  // Image blocks from media attachments
  if (raw.includes?.media) {
    for (const media of raw.includes.media) {
      if (media.type === "photo" && media.url) {
        blocks.push({ type: "image", content: media.url });
      }
    }
  }

  return {
    author: author?.name ?? "Unknown",
    handle: author?.username ?? "unknown",
    profileImageUrl: author?.profile_image_url,
    date: raw.data.created_at,
    blocks,
  };
}
```

**Step 2: Commit**

```bash
git add src/lib/parser/parse-tweet.ts
git commit -m "feat: add content parser transforming X API response to structured blocks"
```

---

## Task 5: Parser Barrel Export

**Files:**
- Create: `src/lib/parser/index.ts`

**Step 1: Create barrel file**

```typescript
export { extractPostId } from "./url";
export { fetchTweet, type XApiTweetResponse } from "./fetch-tweet";
export { parseTweet, type ParsedContent } from "./parse-tweet";
```

**Step 2: Commit**

```bash
git add src/lib/parser/index.ts
git commit -m "feat: add parser barrel export"
```

---

## Task 6: `GET /api/tags` Endpoint

**Files:**
- Create: `src/app/api/tags/route.ts`

**Step 1: Write the endpoint**

Returns the user's distinct tags across all saved posts.

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all tags arrays, then deduplicate client-side
  // (Supabase JS client doesn't support unnest directly)
  const { data, error } = await supabase
    .from("saved_posts")
    .select("tags")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
  }

  const tagSet = new Set<string>();
  for (const row of data ?? []) {
    for (const tag of row.tags ?? []) {
      tagSet.add(tag);
    }
  }

  return NextResponse.json({ tags: [...tagSet].sort() });
}
```

**Step 2: Commit**

```bash
git add src/app/api/tags/route.ts
git commit -m "feat: add GET /api/tags endpoint returning user's distinct tags"
```

---

## Task 7: `POST /api/x/save-post` Endpoint

**Files:**
- Create: `src/app/api/x/save-post/route.ts`

**Step 1: Write the save endpoint**

This is the core endpoint. Authenticates user, validates URL, fetches tweet, parses content, stores with tags.

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import { extractPostId, fetchTweet, parseTweet } from "@/lib/parser";

export async function POST(request: NextRequest) {
  // 1. Authenticate
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse request body
  let url: string;
  let tags: string[];
  try {
    const body = await request.json();
    url = body.url;
    tags = Array.isArray(body.tags) ? body.tags.map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [];
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // 3. Validate URL and extract post ID
  const postId = extractPostId(url);
  if (!postId) {
    return NextResponse.json({ error: "Invalid X post URL" }, { status: 400 });
  }

  // 4. Get user's X connection (encrypted tokens)
  const { data: connection } = await supabase
    .from("x_connections")
    .select("access_token, refresh_token")
    .single();

  if (!connection) {
    return NextResponse.json({ error: "X account not connected" }, { status: 400 });
  }

  // 5. Decrypt access token
  const accessToken = decrypt(connection.access_token);

  // 6. Fetch tweet from X API
  let rawResponse;
  try {
    rawResponse = await fetchTweet(postId, accessToken);
  } catch (err) {
    console.error("X API fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch post from X" }, { status: 502 });
  }

  // 7. Parse into structured content
  const parsed = parseTweet(rawResponse);

  // 8. Store in database (admin client to bypass RLS for insert)
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: savedPost, error: dbError } = await admin
    .from("saved_posts")
    .insert({
      user_id: user.id,
      x_post_id: postId,
      x_post_url: url,
      author_name: parsed.author,
      author_handle: parsed.handle,
      posted_at: parsed.date,
      tags,
      raw_api_response: rawResponse,
      parsed_content: parsed,
    })
    .select("id")
    .single();

  if (dbError) {
    // Unique constraint violation = duplicate
    if (dbError.code === "23505") {
      return NextResponse.json({ error: "Post already saved" }, { status: 409 });
    }
    console.error("DB insert error:", dbError);
    return NextResponse.json({ error: "Failed to save post" }, { status: 500 });
  }

  return NextResponse.json({ success: true, postId: savedPost.id });
}
```

**Step 2: Commit**

```bash
git add src/app/api/x/save-post/route.ts
git commit -m "feat: add POST /api/x/save-post endpoint (fetch, parse, store with tags)"
```

---

## Task 8: Bookmarklet Page — Tag Picker UI

**Files:**
- Create: `src/app/bookmarklet/page.tsx`

**Step 1: Write the bookmarklet page**

A lightweight "use client" page rendered inside the iframe. Fetches existing tags, shows a tag picker, POSTs to save-post.

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { X, Check, Plus, Loader2 } from "lucide-react";

type Status = "idle" | "loading" | "saving" | "saved" | "error";

export default function BookmarkletPage() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url") ?? "";

  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  // Fetch existing tags on mount
  useEffect(() => {
    fetch("/api/tags")
      .then((res) => res.json())
      .then((data) => {
        setExistingTags(data.tags ?? []);
        setStatus("idle");
      })
      .catch(() => setStatus("idle"));
  }, []);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const addNewTag = () => {
    const tag = newTag.trim().toLowerCase();
    if (!tag) return;
    if (!selectedTags.includes(tag)) {
      setSelectedTags((prev) => [...prev, tag]);
    }
    if (!existingTags.includes(tag)) {
      setExistingTags((prev) => [...prev, tag]);
    }
    setNewTag("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addNewTag();
    }
  };

  const handleSave = async () => {
    setStatus("saving");
    try {
      const res = await fetch("/api/x/save-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, tags: selectedTags }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Failed to save");
        setStatus("error");
        return;
      }
      setStatus("saved");
      // Auto-dismiss after 1.5s
      setTimeout(() => {
        window.parent.postMessage({ type: "xml-bookmarklet-close" }, "*");
      }, 1500);
    } catch {
      setErrorMsg("Network error");
      setStatus("error");
    }
  };

  const handleClose = () => {
    window.parent.postMessage({ type: "xml-bookmarklet-close" }, "*");
  };

  // Saved confirmation
  if (status === "saved") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-4">
        <div className="rounded-full bg-primary/10 p-3 mb-3">
          <Check className="h-6 w-6 text-primary" />
        </div>
        <p className="font-semibold text-sm">Saved!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground p-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold truncate flex-1 mr-2">Save to xMomentsLater</p>
        <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* URL preview */}
      <p className="text-xs text-muted-foreground truncate mb-3">{url}</p>

      {/* Tag chips */}
      {status === "loading" ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3 max-h-24 overflow-y-auto">
            {existingTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  selectedTags.includes(tag)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-secondary-foreground border-border hover:border-primary/50"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* New tag input */}
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add tag..."
              className="flex-1 text-xs px-3 py-1.5 rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={addNewTag}
              disabled={!newTag.trim()}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      {/* Error */}
      {status === "error" && (
        <p className="text-xs text-destructive mb-2">{errorMsg}</p>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={status === "saving" || status === "loading"}
        className="mt-auto w-full text-sm font-medium py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {status === "saving" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving...
          </>
        ) : (
          "Save"
        )}
      </button>
    </div>
  );
}
```

**Step 2: Wrap in Suspense**

The `useSearchParams()` hook requires a Suspense boundary. Create a layout or wrap inline. Simplest approach: make the default export a wrapper.

Rename the component to `BookmarkletContent` and wrap:

```tsx
import { Suspense } from "react";

function BookmarkletContent() {
  // ... all the code above
}

export default function BookmarkletPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-4 w-4 animate-spin" /></div>}>
      <BookmarkletContent />
    </Suspense>
  );
}
```

**Step 3: Commit**

```bash
git add src/app/bookmarklet/page.tsx
git commit -m "feat: add bookmarklet page with tag picker UI (iframe-based)"
```

---

## Task 9: Bookmarklet Script + Dashboard Install Section

**Files:**
- Create: `src/lib/bookmarklet.ts`
- Modify: `src/app/dashboard/page.tsx`

**Step 1: Create bookmarklet generator**

A function that returns the bookmarklet code string with the correct APP_URL baked in.

```typescript
export function getBookmarkletCode(appUrl: string): string {
  return `javascript:void((function(){var e=document.getElementById('xml-bookmarklet');if(e){e.remove();return;}var d=document,f=d.createElement('iframe');f.id='xml-bookmarklet';f.src='${appUrl}/bookmarklet?url='+encodeURIComponent(d.location.href);f.style.cssText='position:fixed;top:16px;right:16px;width:340px;height:320px;border:none;border-radius:12px;z-index:2147483647;box-shadow:0 8px 32px rgba(0,0,0,.25)';d.body.appendChild(f);window.addEventListener('message',function h(ev){if(ev.data&&ev.data.type==='xml-bookmarklet-close'){f.remove();window.removeEventListener('message',h);}});})())`;
}
```

**Step 2: Add bookmarklet install section to dashboard**

Modify `src/app/dashboard/page.tsx` to show a draggable bookmarklet link when the user has an X connection but no saved posts. Add below the XConnectionCard:

```tsx
import { getBookmarkletCode } from "@/lib/bookmarklet";

// Inside the component, after XConnectionCard section:
{xConnection && (
  <div className="mb-8 rounded-lg border px-5 py-4">
    <p className="text-sm font-medium mb-1">Install Bookmarklet</p>
    <p className="text-xs text-muted-foreground mb-3">
      Drag this button to your bookmarks bar. Click it on any X post to save it.
    </p>
    <a
      href={getBookmarkletCode(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001")}
      className="inline-block text-xs font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
      onClick={(e) => e.preventDefault()}
    >
      Save to xMomentsLater
    </a>
  </div>
)}
```

**Step 3: Commit**

```bash
git add src/lib/bookmarklet.ts src/app/dashboard/page.tsx
git commit -m "feat: add bookmarklet generator and install section on dashboard"
```

---

## Task 10: Middleware Update — Allow `/bookmarklet` for Authenticated Users

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

**Step 1: Check current middleware behavior**

The `/bookmarklet` page needs auth (to call `/api/tags` and `/api/x/save-post`). Since it's not under `/dashboard`, check if the middleware redirects unauthenticated users from `/bookmarklet` to `/login`. If the middleware only protects `/dashboard/*`, then the bookmarklet page will load but API calls will fail with 401.

Two options:
- **Option A:** Add `/bookmarklet` to the protected routes in middleware — if unauthenticated, the iframe shows a login redirect (bad UX in an iframe).
- **Option B:** Leave `/bookmarklet` unprotected. The API endpoints already return 401. The bookmarklet page handles 401 by showing "Please log in to xMomentsLater first."

**Go with Option B** — the bookmarklet page should handle auth errors gracefully in its UI rather than redirecting inside an iframe.

**Step 2: Update BookmarkletPage to handle 401**

In `src/app/bookmarklet/page.tsx`, update the tag fetch and save handlers to detect 401 and show a "Please log in" message. This is already partially handled (the fetch catch falls through to `idle` state), but add an explicit auth error state.

Add to the existing BookmarkletContent component:

```tsx
// In the useEffect for fetching tags:
useEffect(() => {
  fetch("/api/tags")
    .then((res) => {
      if (res.status === 401) {
        setErrorMsg("Please log in to xMomentsLater first.");
        setStatus("error");
        return;
      }
      return res.json();
    })
    .then((data) => {
      if (data) {
        setExistingTags(data.tags ?? []);
        setStatus("idle");
      }
    })
    .catch(() => setStatus("idle"));
}, []);
```

**Step 3: Commit**

```bash
git add src/app/bookmarklet/page.tsx
git commit -m "feat: handle auth errors gracefully in bookmarklet page"
```

---

## Task 11: Database Migration — `feed_tokens` table

**Files:**
- Create: `supabase/migrations/003_feed_tokens.sql`

**Step 1: Write the migration**

```sql
-- feed_tokens: per-user secret tokens for RSS feed access
create table feed_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz default now() not null
);

-- RLS: users can only read/manage their own token
alter table feed_tokens enable row level security;

create policy "Users select own feed token"
  on feed_tokens for select
  using (auth.uid() = user_id);

create policy "Users insert own feed token"
  on feed_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users delete own feed token"
  on feed_tokens for delete
  using (auth.uid() = user_id);

-- Index for fast lookup by token (used by RSS endpoint)
create index idx_feed_tokens_token on feed_tokens(token);
```

**Step 2: Apply in Supabase dashboard SQL editor**

**Step 3: Commit**

```bash
git add supabase/migrations/003_feed_tokens.sql
git commit -m "feat: add feed_tokens table migration for RSS feed auth"
```

---

## Task 12: RSS Feed Endpoint — `GET /api/feed/[token]`

**Files:**
- Create: `src/app/api/feed/[token]/route.ts`

**Step 1: Write the RSS endpoint**

Looks up user by feed token, fetches their saved posts, renders RSS 2.0 XML with full content.

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { ParsedContent } from "@/lib/parser";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function blocksToHtml(parsed: ParsedContent): string {
  return parsed.blocks
    .map((block) => {
      if (block.type === "text") {
        return `<p>${escapeXml(block.content)}</p>`;
      }
      if (block.type === "image") {
        return `<p><img src="${escapeXml(block.content)}" alt="" style="max-width:100%;" /></p>`;
      }
      return "";
    })
    .join("\n");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Use admin client — RSS endpoint authenticates via token, not session
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Look up user by feed token
  const { data: feedToken, error: tokenError } = await admin
    .from("feed_tokens")
    .select("user_id")
    .eq("token", token)
    .single();

  if (tokenError || !feedToken) {
    return new NextResponse("Feed not found", { status: 404 });
  }

  // Fetch saved posts for this user
  const { data: posts, error: postsError } = await admin
    .from("saved_posts")
    .select("x_post_id, x_post_url, author_name, author_handle, posted_at, saved_at, parsed_content")
    .eq("user_id", feedToken.user_id)
    .order("saved_at", { ascending: false })
    .limit(50);

  if (postsError) {
    return new NextResponse("Internal error", { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  const items = (posts ?? [])
    .map((post) => {
      const parsed = post.parsed_content as ParsedContent | null;
      const title = `@${post.author_handle ?? "unknown"}: ${(parsed?.blocks?.[0]?.content ?? "").slice(0, 80)}`;
      const description = parsed ? blocksToHtml(parsed) : escapeXml(post.x_post_url);

      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(post.x_post_url)}</link>
      <description><![CDATA[${description}]]></description>
      <pubDate>${new Date(post.posted_at ?? post.saved_at).toUTCString()}</pubDate>
      <guid isPermaLink="false">${escapeXml(post.x_post_id)}</guid>
    </item>`;
    })
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>xMomentsLater</title>
    <link>${escapeXml(appUrl)}</link>
    <description>Your saved X posts</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new NextResponse(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/feed/\[token\]/route.ts
git commit -m "feat: add RSS feed endpoint with token-based auth and full content"
```

---

## Task 13: RSS Feed Section on Dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Step 1: Fetch or create feed token in the dashboard server component**

After fetching the X connection, also fetch or auto-create the user's feed token:

```typescript
// After xConnection fetch:
let feedToken: string | null = null;
if (user) {
  const { data: existing } = await supabase
    .from("feed_tokens")
    .select("token")
    .single();

  if (existing) {
    feedToken = existing.token;
  } else {
    // Auto-create feed token on first dashboard visit
    const { createClient: createAdminClient } = await import("@supabase/supabase-js");
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: created } = await admin
      .from("feed_tokens")
      .insert({ user_id: user.id })
      .select("token")
      .single();
    feedToken = created?.token ?? null;
  }
}
```

**Step 2: Add RSS feed URL display**

Add a section below the bookmarklet install section showing the feed URL with a copy button:

```tsx
{feedToken && (
  <FeedUrlCard
    feedUrl={`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/api/feed/${feedToken}`}
  />
)}
```

**Step 3: Create FeedUrlCard client component**

Create `src/components/FeedUrlCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Copy, Check, Rss } from "lucide-react";

export function FeedUrlCard({ feedUrl }: { feedUrl: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-8 rounded-lg border px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <Rss className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">RSS Feed</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Add this URL to your RSS reader to follow your saved posts.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md truncate">
          {feedUrl}
        </code>
        <button
          onClick={handleCopy}
          className="shrink-0 text-muted-foreground hover:text-foreground p-2"
        >
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/components/FeedUrlCard.tsx src/app/dashboard/page.tsx
git commit -m "feat: add RSS feed URL section on dashboard with copy button"
```

---

## Task 14: Build Verification

**Step 1: Run the build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

**Step 2: Run lint**

```bash
npm run lint
```

Expected: No lint errors.

**Step 3: Manual smoke test**

1. Start dev server: `npm run dev`
2. Log in, connect X account
3. Verify bookmarklet install section appears on dashboard
4. Verify RSS feed URL section appears on dashboard
5. Open an X post in a separate tab
6. Run the bookmarklet code in the browser console (or drag to bookmark bar and click)
7. Verify the iframe popup appears with tag picker
8. Add a tag, click Save
9. Verify the post appears in the database via Supabase dashboard
10. Open the RSS feed URL in a browser — verify XML renders with the saved post

**Step 4: Commit any fixes**

---

## Task 15: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the CLAUDE.md with new file paths and patterns**

Add to the Architecture section:
- `src/lib/parser/` — content parsing pipeline (URL extraction, tweet fetch, parse to blocks)
- `src/lib/bookmarklet.ts` — bookmarklet code generator
- `src/app/bookmarklet/` — iframe-based bookmarklet UI with tag picker
- `src/app/api/x/save-post/` — save endpoint
- `src/app/api/tags/` — user's distinct tags
- `src/app/api/feed/[token]/` — RSS feed endpoint (token-based auth)
- `src/components/FeedUrlCard.tsx` — RSS feed URL display with copy button

Update Build Order to mark steps 3 and 4 as complete.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with bookmarklet, parser, and RSS feed architecture"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | DB migration — saved_posts table | `supabase/migrations/002_saved_posts.sql` |
| 2 | URL parser utility | `src/lib/parser/url.ts` |
| 3 | X API tweet fetcher | `src/lib/parser/fetch-tweet.ts` |
| 4 | Content parser — structured blocks | `src/lib/parser/parse-tweet.ts` |
| 5 | Parser barrel export | `src/lib/parser/index.ts` |
| 6 | GET /api/tags endpoint | `src/app/api/tags/route.ts` |
| 7 | POST /api/x/save-post endpoint | `src/app/api/x/save-post/route.ts` |
| 8 | Bookmarklet page — tag picker UI | `src/app/bookmarklet/page.tsx` |
| 9 | Bookmarklet script + dashboard install | `src/lib/bookmarklet.ts`, dashboard page |
| 10 | Auth error handling in bookmarklet | `src/app/bookmarklet/page.tsx` |
| 11 | DB migration — feed_tokens table | `supabase/migrations/003_feed_tokens.sql` |
| 12 | RSS feed endpoint | `src/app/api/feed/[token]/route.ts` |
| 13 | RSS feed section on dashboard | `src/components/FeedUrlCard.tsx`, dashboard page |
| 14 | Build verification | — |
| 15 | Update CLAUDE.md | `CLAUDE.md` |
