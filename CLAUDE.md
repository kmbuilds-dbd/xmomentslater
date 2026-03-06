# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

xMomentsLater is a distraction-free read-later web app for X (Twitter) content. One-click save via bookmarklet, read later in a clean typographic reader — no feeds, no engagement metrics, no distractions. Private library, no social features.

## Product Spec

`xmomentslater.md` is the source of truth for product requirements, feature definitions, and design decisions. Read it before starting any feature work.

## Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build — verify changes compile
npm run start        # Production server
npm run lint         # ESLint
```

No test suite exists yet.

## Tech Stack

- **Next.js 16** (App Router, React 19, TypeScript 5)
- **Tailwind CSS 4** + shadcn/ui (cn() utility via clsx + tailwind-merge)
- **Supabase** — PostgreSQL, Auth (email/password), Row-Level Security
- **X API** — OAuth 2.0 with PKCE (user-level access, user owns rate limits)
- **Anthropic SDK** — Claude 3.5 Haiku for post summaries (`lib/summarize.ts`)
- **Railway** — hosting and deployment

## Architecture

### Route Structure

All authenticated pages live under `/dashboard` (protected by middleware). Landing, `/login`, and `/signup` are public.

```
src/app/
├── page.tsx                      # Landing page
├── login/ & signup/              # Auth pages
├── auth/callback/route.ts        # OAuth code exchange
├── bookmarklet/                  # Tag picker UI (loaded in popup window)
└── dashboard/                    # Protected — requires auth
    ├── page.tsx                  # Library view (search, tag filter, sort, pagination)
    ├── settings/                 # X connection management, bookmarklet, RSS feed URL
    └── reader/[postId]/          # Distraction-free reading view
```

### API Routes

```
src/app/api/
├── auth/                         # Supabase auth helpers
├── tags/                         # GET — user's distinct tags across saved posts
├── feed/[token]/                 # GET — RSS 2.0 feed (token-based auth, no session)
├── x/
│   ├── connect/                  # X OAuth PKCE flow initiation
│   ├── callback/                 # X OAuth callback, store encrypted tokens
│   ├── disconnect/               # Remove X connection
│   └── save-post/                # Bookmarklet endpoint: URL → fetch → parse → store with tags
└── posts/                        # PATCH (mark read), PUT (re-fetch/refresh), DELETE
```

### Bookmarklet

Popup-window bookmarklet opens `/bookmarklet?url={encoded}` from x.com. Shows a tag picker UI, then POSTs to `/api/x/save-post`. Posts message back to parent to signal close.

- `src/lib/bookmarklet.ts` — generates the bookmarklet JavaScript string with app URL baked in
- `src/app/bookmarklet/page.tsx` — client-side tag picker with typeahead, keyboard navigation (arrows, enter, comma, backspace)

### Content Parsing Pipeline

`src/lib/parser/` contains the content parsing pipeline:

- `url.ts` — extract tweet ID from x.com/twitter.com URLs; also `extractArticleId()` for X Articles
- `fetch-tweet.ts` — call X API v2 with user's OAuth token, requesting author + media expansions
- `parse-tweet.ts` — transform raw API response into `ParsedContent` structured blocks (text, image, heading)
- `index.ts` — barrel export

Pipeline: URL → extract post ID → fetch via X API v2 → parse into `{ author, handle, profileImageUrl, date, blocks }` → generate LLM summary → store raw + parsed in DB.

**Article fetch strategy**: Regular user OAuth doesn't return X Article `article.plain_text`. If missing and `X_BEARER_TOKEN` env var exists, code retries with app bearer token and merges the article data into the user-level response.

### X OAuth Token Auto-Refresh

When X API returns 401 (expired token), the code automatically:
1. Decrypts the stored refresh token
2. Calls `refreshAccessToken()` (`lib/x-api/oauth.ts`)
3. Re-encrypts new access + refresh tokens
4. Updates DB with new tokens and expiry
5. Retries the original API call

This pattern is implemented in `/api/x/save-post` and `/api/posts` (PUT). On refresh failure, returns user-facing message about reconnecting X account.

### Supabase Client Patterns

```
Request → middleware.ts → lib/supabase/middleware.ts (updateSession)
  ├── Refreshes session cookies
  ├── /dashboard/* without auth → redirect /login
  └── /login or /signup with auth → redirect /dashboard
```

Three Supabase client types:
- `lib/supabase/client.ts` — browser client for "use client" components
- `lib/supabase/server.ts` — server client for server actions/components (respects RLS)
- **Admin client** — created inline in API routes with `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS. Always imported locally (not at module level) to avoid bundling the service key.

### LLM Summary Generation

`lib/summarize.ts` uses `@anthropic-ai/sdk` with `claude-3-5-haiku-latest` (max 150 tokens) to generate 1-2 sentence summaries. Called after post save and on content refresh. Returns `null` on any failure — callers fall back to truncated text block preview. Gracefully degrades if `ANTHROPIC_API_KEY` is missing.

### Server Actions Pattern

Data mutations use co-located server actions (`actions.ts` files inside route folders). Each action creates a Supabase server client, performs the operation, and calls `revalidatePath()`.

## Data Model

All tables use RLS — users can only access their own data.

- **users** — managed by Supabase Auth
- **x_connections** — user_id (FK, unique), access_token (encrypted), refresh_token (encrypted), x_handle, connected_at, token_expires_at
- **saved_posts** — id, user_id (FK), x_post_id, x_post_url, author_name, author_handle, posted_at, saved_at, read_at (null = unread), tags (text[]), raw_api_response (JSONB), parsed_content (JSONB — structured blocks), title (text, nullable), summary (text, nullable — LLM-generated). GIN index on tags. Unique constraint on `(user_id, x_post_id)` — duplicates return 409.
- **feed_tokens** — user_id (PK, FK), token (unique), created_at. One per user, auto-created on first settings page visit.

### Encryption

`lib/encryption.ts` — AES-256-GCM with 12-byte random IV. Stored format: `"{iv_hex}:{ciphertext_hex}:{authTag_hex}"`. Key from `TOKEN_ENCRYPTION_KEY` (must be 64-char hex = 32 bytes).

## Build Order

Implementation follows this sequence (from spec):

1. ~~Auth + Supabase setup — sign-up, sign-in, session management~~ ✅
2. ~~X OAuth connection flow — connect X account, store tokens securely~~ ✅
3. ~~Bookmarklet + save endpoint — URL → post ID → fetch → store~~ ✅
4. ~~Content parser — single posts and X Notes → clean JSON blocks~~ ✅
5. ~~Library view — list of saved posts, read/unread state, search, tag filter, sort, pagination~~ ✅
6. ~~Reader view — clean typographic display, scroll progress, read time, refresh~~ ✅

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Supabase anonymous key
SUPABASE_SERVICE_ROLE_KEY         # Admin key (server-only, for DB writes past RLS)
NEXT_PUBLIC_X_CLIENT_ID           # X OAuth 2.0 client ID (same as Consumer Key)
X_CLIENT_SECRET                   # X OAuth 2.0 secret (same as Consumer Secret, server-only)
NEXT_PUBLIC_APP_URL               # App base URL (default: http://localhost:3001)
TOKEN_ENCRYPTION_KEY              # 64-char hex string for AES-256-GCM token encryption
X_BEARER_TOKEN                    # App bearer token (optional, required for X Article content)
ANTHROPIC_API_KEY                 # Anthropic API key (optional, enables LLM summaries)
ALLOWED_SIGNUP_EMAILS             # Comma-separated whitelist (empty = open signup)
```

`NEXT_PUBLIC_*` vars are baked in at build time. `@/*` path alias maps to `./src/*`.

## Gotchas

- **Search queries are sanitized**: Parentheses and commas are stripped from search input to prevent breaking PostgREST `.or()` filter syntax.
- **Heading detection is heuristic**: `isLikelyHeading()` in `parse-tweet.ts` checks line length < 80 chars and no trailing sentence punctuation. Not perfect for all content.
- **Feed tokens auto-created on settings page visit**, not on signup.
- **Cookie deletion in OAuth callback** wrapped in try/catch — some Next.js versions throw on cookie deletion.
- **Bookmarklet blur delay**: 150ms delay before closing typeahead dropdown, allowing click on suggestion before it disappears.
- **Fonts**: Three Google Fonts loaded in `layout.tsx` — Fraunces (serif display/headings), Plus Jakarta Sans (body), Newsreader (serif, loaded but not actively used).

## Design Rules

- **Reader strips everything**: no like counts, retweet counts, reply prompts, related posts, engagement overlays
- **Reader typography**: centered column ~65ch wide, comfortable line height, light/dark mode
- **User-level OAuth**: each user's X requests hit their own rate limits, not the app's
- **OAuth tokens encrypted at rest** in Postgres
- **No social features**: private library only, no sharing between users
- **v1 content scope**: single posts, X Notes, posts with images. Threads are post-v1.
