# xMomentsLater

A distraction-free read-later app for X (Twitter) content. Save any post with one click, read it later in a clean typographic reader — no feeds, no metrics, no noise.

## Why

X has become a serious platform for long-form writing — long posts, X Notes, in-depth threads. But the platform is engineered to keep you scrolling. There's no way to save content and read it later without the algorithmic pull.

xMomentsLater fixes that. One-click save via bookmarklet, private library, clean reader.

## Features

- **Bookmarklet** — Click it on any `x.com` post to save. An iframe popup lets you add optional freeform tags before saving.
- **Content Parser** — Fetches posts via X API v2, extracts text + images, resolves shortened URLs, handles X Notes (long-form).
- **Library** — Your saved posts with read/unread status, searchable by author or keyword.
- **Reader View** — Centered column, comfortable typography, light/dark mode. No like counts, no reply prompts, no engagement overlays.
- **Tagging** — Freeform tags on every saved post. Existing tags appear as quick-pick chips in the bookmarklet.
- **RSS Feed** — Token-authenticated feed URL you can add to any RSS reader. Full post content inline.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) + Tailwind CSS 4 + shadcn/ui |
| Backend | Next.js API routes |
| Database | Supabase (Postgres + Row-Level Security) |
| Auth | Supabase Auth (email/password) + X OAuth 2.0 (PKCE) |
| Token Security | AES-256-GCM encryption at rest |
| Hosting | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [X Developer](https://developer.x.com) app with OAuth 2.0 enabled

### Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/kmbuilds-dbd/xmomentslater.git
   cd xmomentslater
   npm install
   ```

2. Copy the env template and fill in your values:
   ```bash
   cp .env.local.example .env.local
   ```

   Required variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   NEXT_PUBLIC_X_CLIENT_ID=
   X_CLIENT_SECRET=
   NEXT_PUBLIC_APP_URL=http://localhost:3001
   TOKEN_ENCRYPTION_KEY=          # 64-char hex string (32 bytes)
   ```

   Generate an encryption key:
   ```bash
   openssl rand -hex 32
   ```

3. Run the database migrations in your Supabase SQL editor:
   ```
   supabase/migrations/001_x_connections.sql
   supabase/migrations/002_saved_posts.sql
   supabase/migrations/003_feed_tokens.sql
   ```

4. Start the dev server:
   ```bash
   npm run dev
   ```

   Open [http://localhost:3001](http://localhost:3001).

### Using the Bookmarklet

1. Sign up and connect your X account from the dashboard.
2. Drag the "Save to xMomentsLater" button to your bookmarks bar.
3. Navigate to any post on x.com and click the bookmarklet.
4. Optionally add tags, then hit Save.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── login/ & signup/            # Auth pages
│   ├── bookmarklet/                # Iframe tag picker UI
│   ├── dashboard/                  # Protected library + settings
│   └── api/
│       ├── x/connect/              # X OAuth PKCE initiation
│       ├── x/callback/             # X OAuth token exchange
│       ├── x/disconnect/           # Revoke X connection
│       ├── x/save-post/            # Bookmarklet save endpoint
│       ├── tags/                   # User's distinct tags
│       └── feed/[token]/           # RSS feed (token auth)
├── components/                     # UI components
└── lib/
    ├── parser/                     # URL extraction, tweet fetch, content parsing
    ├── encryption.ts               # AES-256-GCM for OAuth tokens
    ├── bookmarklet.ts              # Bookmarklet code generator
    └── supabase/                   # Supabase client helpers
```

## License

MIT
