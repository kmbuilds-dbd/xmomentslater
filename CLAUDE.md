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
- **Tailwind CSS 4** + shadcn/ui
- **Supabase** — PostgreSQL, Auth (email/password), Row-Level Security
- **X API** — OAuth 2.0 with PKCE (user-level access, user owns rate limits)
- **Vercel** — hosting and deployment

## Architecture

### Route Structure

All authenticated pages live under `/dashboard` (protected by middleware). Landing, `/login`, and `/signup` are public.

```
src/app/
├── page.tsx                      # Landing page
├── login/ & signup/              # Auth pages
├── auth/callback/route.ts        # OAuth code exchange
└── dashboard/                    # Protected — requires auth
    ├── library/                  # List of saved posts (read/unread, search)
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
└── posts/                        # Post management (mark read, delete)
```

### Bookmarklet

Iframe-based bookmarklet injects `/bookmarklet` page onto x.com. Shows a tag picker UI, then POSTs to `/api/x/save-post`. Auto-dismisses on save.

- `src/lib/bookmarklet.ts` — generates the bookmarklet JavaScript string with app URL baked in
- `src/app/bookmarklet/page.tsx` — client-side tag picker UI loaded inside the iframe

### Content Parsing Pipeline

`src/lib/parser/` contains the content parsing pipeline:

- `url.ts` — extract tweet ID from x.com/twitter.com URLs
- `fetch-tweet.ts` — call X API v2 with user's OAuth token, requesting author + media expansions
- `parse-tweet.ts` — transform raw API response into `ParsedContent` structured blocks
- `index.ts` — barrel export

Pipeline: URL → extract post ID → fetch via X API v2 → parse into `{ author, handle, date, blocks }` → store raw + parsed in DB.

### RSS Feed

Token-authenticated RSS endpoint at `/api/feed/[token]` serves saved posts as RSS 2.0 XML with full content. Feed tokens are auto-created on first dashboard visit.

- `src/components/FeedUrlCard.tsx` — displays feed URL with copy button on dashboard

### Supabase Auth Flow

```
Request → middleware.ts → lib/supabase/middleware.ts (updateSession)
  ├── Refreshes session cookies
  ├── /dashboard/* without auth → redirect /login
  └── /login or /signup with auth → redirect /dashboard
```

Two Supabase clients:
- `lib/supabase/client.ts` — browser client for "use client" components
- `lib/supabase/server.ts` — server client for server actions/components

### Server Actions Pattern

Data mutations use co-located server actions (`actions.ts` files inside route folders). Each action creates a Supabase server client, performs the operation, and calls `revalidatePath()`.

## Data Model

All tables use RLS — users can only access their own data.

- **users** — managed by Supabase Auth
- **x_connections** — user_id (FK), access_token (encrypted), refresh_token (encrypted), x_handle, connected_at
- **saved_posts** — id, user_id (FK), x_post_id, x_post_url, author_name, author_handle, posted_at, saved_at, read_at (null = unread), tags (text[]), raw_api_response (JSONB), parsed_content (JSONB — structured blocks). GIN index on tags.
- **feed_tokens** — user_id (PK, FK), token (unique), created_at. One per user, auto-created on dashboard visit.

## Build Order

Implementation follows this sequence (from spec):

1. ~~Auth + Supabase setup — sign-up, sign-in, session management~~ ✅
2. ~~X OAuth connection flow — connect X account, store tokens securely~~ ✅
3. ~~Bookmarklet + save endpoint — URL → post ID → fetch → store~~ ✅
4. ~~Content parser — single posts and X Notes → clean JSON blocks~~ ✅
5. Library view — list of saved posts, read/unread state, search
6. Reader view — clean typographic display of parsed content

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Supabase anonymous key
SUPABASE_SERVICE_ROLE_KEY         # Admin key (server-only, for DB writes past RLS)
NEXT_PUBLIC_X_CLIENT_ID           # X OAuth 2.0 client ID (same as Consumer Key)
X_CLIENT_SECRET                   # X OAuth 2.0 secret (same as Consumer Secret, server-only)
NEXT_PUBLIC_APP_URL               # App base URL (default: http://localhost:3001)
TOKEN_ENCRYPTION_KEY              # 32-byte hex string for AES-256-GCM token encryption
```

Also stored in `.env.local` but not used in OAuth flow yet:
- `X_CONSUMER_KEY` / `X_CONSUMER_SECRET` / `X_BEARER_TOKEN` — for future X API v1.1/v2 calls

`NEXT_PUBLIC_*` vars are baked in at build time. `@/*` path alias maps to `./src/*`.

## Design Rules

- **Reader strips everything**: no like counts, retweet counts, reply prompts, related posts, engagement overlays
- **Reader typography**: centered column ~65–70 chars wide, comfortable line height, light/dark mode
- **User-level OAuth**: each user's X requests hit their own rate limits, not the app's
- **OAuth tokens encrypted at rest** in Postgres
- **No social features**: private library only, no sharing between users
- **v1 content scope**: single posts, X Notes, posts with images. Threads are post-v1.
