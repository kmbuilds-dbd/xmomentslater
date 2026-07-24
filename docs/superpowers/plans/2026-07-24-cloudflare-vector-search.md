# Cloudflare Vector Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare Vectorize semantic-search sidecar using OpenAI embeddings and wire the current Next.js app to index, delete, backfill, and search saved X posts.

**Architecture:** The Next.js app remains the canonical app database/auth layer for this phase. A Cloudflare Worker owns embedding generation and Vectorize operations behind signed internal routes. The browser talks only to Next.js; Next.js authenticates the user, calls the Worker, and returns existing library-card data.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Supabase client for existing canonical records, Cloudflare Workers, Cloudflare Vectorize, OpenAI embeddings API with `text-embedding-3-small`.

## Global Constraints

- Build a Cloudflare semantic sidecar now; defer full Supabase replacement.
- Store only derived vectors and minimal metadata in Vectorize.
- Browser must never call the Worker directly or receive Cloudflare/OpenAI secrets.
- Use `Authorization: Bearer ${VECTOR_SEARCH_SECRET}` for Worker routes.
- Use one deterministic vector ID per saved post: `${postId}`.
- Make indexing best-effort so save/sync/refresh/delete flows keep working if semantic indexing fails.
- Refresh must persist regenerated `text_content` to fix stale keyword search.
- Long post text is truncated for this phase; chunking is out of scope.
- Semantic search must filter by `user_id`.

---

## File Structure

- Create `cloudflare/vector-search/package.json`: Worker package scripts and dev dependencies.
- Create `cloudflare/vector-search/tsconfig.json`: TypeScript config for Worker source.
- Create `cloudflare/vector-search/wrangler.example.jsonc`: example Worker bindings and Vectorize index settings.
- Create `cloudflare/vector-search/src/index.ts`: Worker router, auth, OpenAI embedding calls, Vectorize upsert/delete/query.
- Create `src/lib/vector-search.ts`: server-only Next.js helper for indexing, deleting, and searching via the Worker.
- Create `src/lib/saved-posts.ts`: shared mapper to convert `saved_posts` rows into `LibraryView` post props.
- Create `src/app/api/search/semantic/route.ts`: authenticated semantic search API for browser clients.
- Create `src/app/api/search/backfill/route.ts`: authenticated/admin-gated semantic backfill route.
- Modify `src/app/api/x/save-post/route.ts`: call index helper after manual save succeeds.
- Modify `src/app/api/cron/sync-bookmarks/route.ts`: call index helper after bookmark sync insert succeeds.
- Modify `src/app/api/posts/route.ts`: re-index on refresh, delete vector on delete, and persist `text_content`.
- Modify `src/app/dashboard/page.tsx`: route semantic mode to initial search results and reuse shared mapper.
- Modify `src/components/LibraryView.tsx`: add search mode control and client-side semantic result fetch.
- Modify `.env.local.example`: document Cloudflare Worker URL and shared secret.
- Modify `tasks/todo.md`: track implementation progress and review notes.

---

### Task 1: Worker Sidecar

**Files:**
- Create: `cloudflare/vector-search/package.json`
- Create: `cloudflare/vector-search/tsconfig.json`
- Create: `cloudflare/vector-search/wrangler.example.jsonc`
- Create: `cloudflare/vector-search/src/index.ts`

**Interfaces:**
- Produces: Worker routes `GET /health`, `POST /index-post`, `POST /delete-post`, `POST /search`.
- Produces request types `IndexPostRequest`, `DeletePostRequest`, `SearchRequest`.
- Produces search response `{ matches: Array<{ postId: string; score: number }> }`.

- [ ] **Step 1: Create Worker package files**

Create `cloudflare/vector-search/package.json`:

```json
{
  "name": "xmomentslater-vector-search",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "build": "tsc --noEmit",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260724.0",
    "typescript": "^5.9.3",
    "wrangler": "^4.0.0"
  }
}
```

Create `cloudflare/vector-search/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `cloudflare/vector-search/wrangler.example.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "xmomentslater-vector-search",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-24",
  "vectorize": [
    {
      "binding": "POST_VECTORS",
      "index_name": "xmomentslater-post-vectors"
    }
  ]
}
```

- [ ] **Step 2: Create Worker implementation**

Create `cloudflare/vector-search/src/index.ts` with focused helpers:

```ts
interface Env {
  OPENAI_API_KEY: string;
  VECTOR_SEARCH_SECRET: string;
  POST_VECTORS: VectorizeIndex;
}

interface IndexPostRequest {
  postId: string;
  userId: string;
  xPostId: string;
  text: string;
  authorHandle?: string | null;
  title?: string | null;
  source?: string | null;
  savedAt?: string | null;
}

interface DeletePostRequest {
  postId: string;
  userId: string;
}

interface SearchRequest {
  userId: string;
  query: string;
  limit?: number;
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_EMBED_CHARS = 12000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function vectorId(userId: string, postId: string): string {
  return `${userId}:${postId}`;
}

function isAuthorized(request: Request, env: Env): boolean {
  const header = request.headers.get("authorization");
  return header === `Bearer ${env.VECTOR_SEARCH_SECRET}`;
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_EMBED_CHARS);
}

async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

async function embed(text: string, env: Env): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI embeddings failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const embedding = payload.data?.[0]?.embedding;
  if (!embedding?.length) {
    throw new Error("OpenAI embeddings response did not include an embedding");
  }
  return embedding;
}

async function handleIndex(request: Request, env: Env): Promise<Response> {
  const body = await readJson<IndexPostRequest>(request);
  const text = cleanText(body.text ?? "");
  if (!body.postId || !body.userId || !text) {
    return json({ error: "postId, userId, and text are required" }, 400);
  }

  const values = await embed(text, env);
  await env.POST_VECTORS.upsert([
    {
      id: vectorId(body.userId, body.postId),
      values,
      metadata: {
        user_id: body.userId,
        post_id: body.postId,
        x_post_id: body.xPostId,
        author_handle: body.authorHandle ?? null,
        title: body.title ?? null,
        source: body.source ?? null,
        saved_at: body.savedAt ?? null,
      },
    },
  ]);

  return json({ success: true });
}

async function handleDelete(request: Request, env: Env): Promise<Response> {
  const body = await readJson<DeletePostRequest>(request);
  if (!body.postId || !body.userId) {
    return json({ error: "postId and userId are required" }, 400);
  }

  await env.POST_VECTORS.deleteByIds([vectorId(body.userId, body.postId)]);
  return json({ success: true });
}

async function handleSearch(request: Request, env: Env): Promise<Response> {
  const body = await readJson<SearchRequest>(request);
  const query = cleanText(body.query ?? "");
  if (!body.userId || !query) {
    return json({ matches: [] });
  }

  const values = await embed(query, env);
  const result = await env.POST_VECTORS.query(values, {
    topK: Math.min(Math.max(body.limit ?? 20, 1), 50),
    filter: { user_id: body.userId },
    returnMetadata: "all",
  });

  return json({
    matches: result.matches.map((match) => ({
      postId: String(match.metadata?.post_id ?? ""),
      score: match.score,
    })).filter((match) => match.postId),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    if (!isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    try {
      if (request.method === "POST" && url.pathname === "/index-post") {
        return handleIndex(request, env);
      }
      if (request.method === "POST" && url.pathname === "/delete-post") {
        return handleDelete(request, env);
      }
      if (request.method === "POST" && url.pathname === "/search") {
        return handleSearch(request, env);
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error(error);
      return json(
        { error: error instanceof Error ? error.message : "Internal error" },
        500
      );
    }
  },
};
```

- [ ] **Step 3: Verify Worker types**

Run:

```bash
cd cloudflare/vector-search
npm install
npm run build
```

Expected: TypeScript completes with no errors.

---

### Task 2: Next.js Vector Search Client

**Files:**
- Create: `src/lib/vector-search.ts`
- Modify: `.env.local.example`

**Interfaces:**
- Produces: `indexSavedPostVector(input: IndexSavedPostVectorInput): Promise<void>`.
- Produces: `deleteSavedPostVector(input: DeleteSavedPostVectorInput): Promise<void>`.
- Produces: `searchSavedPostVectors(input: SearchSavedPostVectorsInput): Promise<VectorSearchMatch[]>`.
- Consumed by save/sync/refresh/delete/backfill/search API tasks.

- [ ] **Step 1: Create server-only Worker client**

Create `src/lib/vector-search.ts`:

```ts
import "server-only";

export interface IndexSavedPostVectorInput {
  postId: string;
  userId: string;
  xPostId: string;
  text: string | null;
  authorHandle?: string | null;
  title?: string | null;
  source?: string | null;
  savedAt?: string | null;
}

export interface DeleteSavedPostVectorInput {
  postId: string;
  userId: string;
}

export interface SearchSavedPostVectorsInput {
  userId: string;
  query: string;
  limit?: number;
}

export interface VectorSearchMatch {
  postId: string;
  score: number;
}

function getVectorSearchConfig(): { url: string; secret: string } | null {
  const url = process.env.VECTOR_SEARCH_WORKER_URL?.replace(/\/$/, "");
  const secret = process.env.VECTOR_SEARCH_SECRET;
  if (!url || !secret) return null;
  return { url, secret };
}

async function callVectorWorker<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const config = getVectorSearchConfig();
  if (!config) {
    throw new Error("Vector search is not configured");
  }

  const response = await fetch(`${config.url}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vector search request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
}

export function isVectorSearchConfigured(): boolean {
  return getVectorSearchConfig() !== null;
}

export async function indexSavedPostVector(
  input: IndexSavedPostVectorInput
): Promise<void> {
  const text = input.text?.trim();
  if (!text || !isVectorSearchConfigured()) return;

  await callVectorWorker<{ success: true }>("/index-post", {
    ...input,
    text,
  });
}

export async function deleteSavedPostVector(
  input: DeleteSavedPostVectorInput
): Promise<void> {
  if (!isVectorSearchConfigured()) return;
  await callVectorWorker<{ success: true }>("/delete-post", input);
}

export async function searchSavedPostVectors(
  input: SearchSavedPostVectorsInput
): Promise<VectorSearchMatch[]> {
  if (!isVectorSearchConfigured()) {
    throw new Error("Vector search is not configured");
  }

  const result = await callVectorWorker<{ matches: VectorSearchMatch[] }>(
    "/search",
    input
  );
  return result.matches;
}
```

- [ ] **Step 2: Document environment variables**

Add to `.env.local.example`:

```text
VECTOR_SEARCH_WORKER_URL          # Cloudflare Worker URL for semantic search sidecar
VECTOR_SEARCH_SECRET              # Shared secret for Next.js -> Worker calls
OPENAI_API_KEY                    # OpenAI API key configured as a Cloudflare Worker secret
```

- [ ] **Step 3: Verify Next.js compilation**

Run:

```bash
npm run lint
```

Expected: ESLint completes with no errors.

---

### Task 3: Shared Saved Post Mapping

**Files:**
- Create: `src/lib/saved-posts.ts`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Produces: `SavedPostRow`, `LibraryPost`, `mapSavedPostToLibraryPost(post: SavedPostRow): LibraryPost`.
- Consumed by dashboard and semantic search API.

- [ ] **Step 1: Create shared mapper**

Create `src/lib/saved-posts.ts`:

```ts
export interface ParsedContent {
  blocks?: { type: string; content: string }[];
}

export interface SavedPostRow {
  id: string;
  author_name: string | null;
  author_handle: string | null;
  posted_at: string | null;
  saved_at: string;
  read_at: string | null;
  tags: string[] | null;
  x_post_url: string;
  parsed_content: ParsedContent | null;
  raw_api_response: unknown;
  summary: string | null;
  title: string | null;
  source: string | null;
}

export interface LibraryPost {
  id: string;
  authorName: string | null;
  authorHandle: string | null;
  postedAt: string | null;
  savedAt: string;
  readAt: string | null;
  tags: string[];
  xPostUrl: string;
  title: string | null;
  preview: string;
  source: string;
}

function getRawText(raw: unknown): string {
  if (!raw || typeof raw !== "object" || !("data" in raw)) return "";
  const data = (raw as { data?: { note_tweet?: { text?: string }; text?: string } }).data;
  return data?.note_tweet?.text ?? data?.text ?? "";
}

export function getPreview(parsed: ParsedContent | null, raw?: unknown): string {
  const textBlock = parsed?.blocks?.find((block) => block.type === "text");
  if (textBlock?.content) return textBlock.content.slice(0, 200);
  return getRawText(raw).slice(0, 200);
}

export function mapSavedPostToLibraryPost(post: SavedPostRow): LibraryPost {
  return {
    id: post.id,
    authorName: post.author_name,
    authorHandle: post.author_handle,
    postedAt: post.posted_at,
    savedAt: post.saved_at,
    readAt: post.read_at,
    tags: post.tags ?? [],
    xPostUrl: post.x_post_url,
    title: post.title,
    preview: post.summary ?? getPreview(post.parsed_content, post.raw_api_response),
    source: post.source ?? "manual",
  };
}
```

- [ ] **Step 2: Use mapper in dashboard**

In `src/app/dashboard/page.tsx`, remove the local `ParsedContent` and `getPreview` definitions, import the mapper, and replace the `posts` mapping:

```ts
import {
  mapSavedPostToLibraryPost,
  type SavedPostRow,
} from "@/lib/saved-posts";
```

```ts
const posts = (savedPosts ?? []).map((post) =>
  mapSavedPostToLibraryPost(post as SavedPostRow)
);
```

- [ ] **Step 3: Verify dashboard still compiles**

Run:

```bash
npm run lint
```

Expected: ESLint completes with no errors.

---

### Task 4: Indexing Hooks

**Files:**
- Modify: `src/app/api/x/save-post/route.ts`
- Modify: `src/app/api/cron/sync-bookmarks/route.ts`
- Modify: `src/app/api/posts/route.ts`

**Interfaces:**
- Consumes: `indexSavedPostVector()` and `deleteSavedPostVector()` from `src/lib/vector-search.ts`.
- Produces: all save/sync/refresh/delete paths keep canonical DB behavior while best-effort indexing runs after successful mutations.

- [ ] **Step 1: Wire manual save indexing**

In `src/app/api/x/save-post/route.ts`, import:

```ts
import { indexSavedPostVector } from "@/lib/vector-search";
```

After the insert succeeds, before returning JSON, add:

```ts
try {
  await indexSavedPostVector({
    postId: savedPost.id,
    userId,
    xPostId: postId,
    text: textContent,
    authorHandle: parsed.handle,
    title,
    source: "manual",
    savedAt: new Date().toISOString(),
  });
} catch (err) {
  console.error("Vector indexing failed:", err);
}
```

- [ ] **Step 2: Wire bookmark sync indexing**

In `src/app/api/cron/sync-bookmarks/route.ts`, import:

```ts
import { indexSavedPostVector } from "@/lib/vector-search";
```

Change the insert to return `id, saved_at`:

```ts
const { data: insertedPost, error: insertError } = await admin
  .from("saved_posts")
  .insert({
    user_id: conn.user_id,
    x_post_id: tweet.id,
    x_post_url: postUrl,
    author_name: parsed.author,
    author_handle: parsed.handle,
    posted_at: parsed.date,
    tags: ["bookmark"],
    raw_api_response: singleResponse,
    parsed_content: parsed,
    title,
    summary,
    source: "bookmark",
    text_content: textContent || null,
  })
  .select("id, saved_at")
  .single();
```

After a successful insert, add:

```ts
try {
  await indexSavedPostVector({
    postId: insertedPost.id,
    userId: conn.user_id,
    xPostId: tweet.id,
    text: textContent,
    authorHandle: parsed.handle,
    title,
    source: "bookmark",
    savedAt: insertedPost.saved_at,
  });
} catch (err) {
  console.error(`Vector indexing failed for tweet ${tweet.id}:`, err);
}
```

- [ ] **Step 3: Fix refresh text persistence and re-indexing**

In `src/app/api/posts/route.ts`, import:

```ts
import {
  deleteSavedPostVector,
  indexSavedPostVector,
} from "@/lib/vector-search";
```

Update the refresh `.update()` payload to include `text_content`:

```ts
text_content: textContent || null,
```

After the update succeeds, add:

```ts
try {
  await indexSavedPostVector({
    postId: id,
    userId: user.id,
    xPostId: post.x_post_id,
    text: textContent,
    authorHandle: parsed.handle,
    title,
    source: null,
    savedAt: null,
  });
} catch (err) {
  console.error("Vector re-indexing failed:", err);
}
```

- [ ] **Step 4: Wire delete cleanup**

Before deleting, fetch the current user's post ID if needed. After successful DB delete, add:

```ts
try {
  await deleteSavedPostVector({ postId: id, userId: user.id });
} catch (err) {
  console.error("Vector deletion failed:", err);
}
```

- [ ] **Step 5: Verify mutation paths compile**

Run:

```bash
npm run lint
```

Expected: ESLint completes with no errors.

---

### Task 5: Semantic Search API and Backfill

**Files:**
- Create: `src/app/api/search/semantic/route.ts`
- Create: `src/app/api/search/backfill/route.ts`

**Interfaces:**
- Consumes: `searchSavedPostVectors()` and `indexSavedPostVector()`.
- Consumes: `mapSavedPostToLibraryPost()`.
- Produces: browser-safe semantic search API returning `{ posts, unavailable?: boolean, error?: string }`.
- Produces: backfill API returning `{ success, indexed, skipped, failed }`.

- [ ] **Step 1: Add semantic search API route**

Create `src/app/api/search/semantic/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  mapSavedPostToLibraryPost,
  type SavedPostRow,
} from "@/lib/saved-posts";
import {
  isVectorSearchConfigured,
  searchSavedPostVectors,
} from "@/lib/vector-search";

const MAX_RESULTS = 20;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isVectorSearchConfigured()) {
    return NextResponse.json({ posts: [], unavailable: true });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ posts: [] });
  }

  try {
    const matches = await searchSavedPostVectors({
      userId: user.id,
      query: q,
      limit: MAX_RESULTS,
    });

    const ids = matches.map((match) => match.postId);
    if (ids.length === 0) {
      return NextResponse.json({ posts: [] });
    }

    const { data, error } = await supabase
      .from("saved_posts")
      .select(
        "id, author_name, author_handle, posted_at, saved_at, read_at, tags, x_post_url, parsed_content, raw_api_response, summary, title, source"
      )
      .in("id", ids);

    if (error) {
      console.error("Semantic search post lookup failed:", error);
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }

    const byId = new Map(
      (data ?? []).map((post) => [
        post.id,
        mapSavedPostToLibraryPost(post as SavedPostRow),
      ])
    );
    const posts = ids.map((id) => byId.get(id)).filter(Boolean);

    return NextResponse.json({ posts });
  } catch (err) {
    console.error("Semantic search failed:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 502 });
  }
}
```

- [ ] **Step 2: Add backfill route**

Create `src/app/api/search/backfill/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { indexSavedPostVector } from "@/lib/vector-search";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmails = (process.env.SEMANTIC_BACKFILL_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!user.email || !adminEmails.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 100);
  const cursor = typeof body.cursor === "string" ? body.cursor : undefined;

  let query = supabase
    .from("saved_posts")
    .select("id, user_id, x_post_id, author_handle, title, source, saved_at, text_content")
    .not("text_content", "is", null)
    .order("saved_at", { ascending: true })
    .limit(limit);

  if (cursor) {
    query = query.gt("saved_at", cursor);
  }

  const { data: posts, error } = await query;
  if (error) {
    console.error("Semantic backfill lookup failed:", error);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }

  let indexed = 0;
  let skipped = 0;
  let failed = 0;

  for (const post of posts ?? []) {
    if (!post.text_content?.trim()) {
      skipped++;
      continue;
    }

    try {
      await indexSavedPostVector({
        postId: post.id,
        userId: post.user_id,
        xPostId: post.x_post_id,
        text: post.text_content,
        authorHandle: post.author_handle,
        title: post.title,
        source: post.source,
        savedAt: post.saved_at,
      });
      indexed++;
    } catch (err) {
      failed++;
      console.error(`Semantic backfill failed for ${post.id}:`, err);
    }
  }

  const last = posts?.at(-1);

  return NextResponse.json({
    success: true,
    indexed,
    skipped,
    failed,
    nextCursor: last?.saved_at ?? null,
  });
}
```

- [ ] **Step 3: Document backfill admin env**

Add to `.env.local.example`:

```text
SEMANTIC_BACKFILL_ADMIN_EMAILS    # Comma-separated emails allowed to run semantic backfill
```

- [ ] **Step 4: Verify API routes compile**

Run:

```bash
npm run lint
```

Expected: ESLint completes with no errors.

---

### Task 6: Semantic Search UI

**Files:**
- Modify: `src/components/LibraryView.tsx`

**Interfaces:**
- Consumes: `/api/search/semantic?q=...`.
- Produces: keyword/semantic segmented control and semantic result rendering.

- [ ] **Step 1: Add search mode state**

In `src/components/LibraryView.tsx`, add:

```ts
type SearchMode = "keyword" | "semantic";
const [searchMode, setSearchMode] = useState<SearchMode>("keyword");
const [semanticPosts, setSemanticPosts] = useState(posts);
const [semanticLoading, setSemanticLoading] = useState(false);
const [semanticError, setSemanticError] = useState<string | null>(null);
```

- [ ] **Step 2: Fetch semantic results**

Add an effect:

```ts
useEffect(() => {
  if (searchMode !== "semantic" || !searchInput.trim()) {
    setSemanticPosts(posts);
    setSemanticError(null);
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(async () => {
    setSemanticLoading(true);
    setSemanticError(null);
    try {
      const response = await fetch(
        `/api/search/semantic?q=${encodeURIComponent(searchInput.trim())}`,
        { signal: controller.signal }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Search failed");
      }
      if (data.unavailable) {
        setSemanticError("Semantic search is not configured.");
        setSemanticPosts([]);
      } else {
        setSemanticPosts(data.posts ?? []);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setSemanticError(err instanceof Error ? err.message : "Search failed");
      }
    } finally {
      if (!controller.signal.aborted) {
        setSemanticLoading(false);
      }
    }
  }, 300);

  return () => {
    controller.abort();
    clearTimeout(timeout);
  };
}, [posts, searchInput, searchMode]);
```

- [ ] **Step 3: Keep keyword URL behavior scoped to keyword mode**

Update the existing debounced keyword search effect so it only calls `updateParams({ q: ... })` when `searchMode === "keyword"`.

- [ ] **Step 4: Render mode controls and selected posts**

Add compact buttons near the search input:

```tsx
<div className="flex rounded-md border p-0.5 text-xs">
  <button
    type="button"
    onClick={() => setSearchMode("keyword")}
    className={searchMode === "keyword" ? "rounded bg-accent px-2 py-1" : "px-2 py-1"}
  >
    Keyword
  </button>
  <button
    type="button"
    onClick={() => setSearchMode("semantic")}
    className={searchMode === "semantic" ? "rounded bg-accent px-2 py-1" : "px-2 py-1"}
  >
    Semantic
  </button>
</div>
```

Render `const visiblePosts = searchMode === "semantic" ? semanticPosts : posts;` and map over `visiblePosts` in the list.

Show `semanticLoading` and `semanticError` above the list with small muted text.

- [ ] **Step 5: Verify UI compiles**

Run:

```bash
npm run lint
```

Expected: ESLint completes with no errors.

---

### Task 7: Final Verification

**Files:**
- Modify: `tasks/todo.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces a verified build and updated task review notes.

- [ ] **Step 1: Run full Next.js verification**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands complete with no errors.

- [ ] **Step 2: Run Worker verification**

Run:

```bash
cd cloudflare/vector-search
npm run build
```

Expected: TypeScript completes with no errors.

- [ ] **Step 3: Review diff**

Run:

```bash
git diff --stat
git diff -- src/app src/lib cloudflare .env.local.example tasks/todo.md
```

Expected: changes match the sidecar semantic-search scope.

- [ ] **Step 4: Update task tracker**

Update `tasks/todo.md` to mark completed semantic-search implementation items and add verification notes including commands run and any unavailable live checks.

- [ ] **Step 5: Commit implementation**

Run:

```bash
git add cloudflare src .env.local.example tasks/todo.md
git commit -m "feat: add cloudflare vector search"
```

Expected: commit succeeds.
