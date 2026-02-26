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
| Hosting | Railway (or Vercel) |

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

## Deploying to Railway

### 1. Create Railway Project

1. Go to [railway.app](https://railway.app) and create a new project.
2. Choose **Deploy from GitHub repo** and select `kmbuilds-dbd/xmomentslater`.
3. Railway auto-detects Next.js — no Dockerfile needed.

### 2. Set Environment Variables

In Railway dashboard → your service → **Variables**, add:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_X_CLIENT_ID=your_x_client_id
X_CLIENT_SECRET=your_x_client_secret
NEXT_PUBLIC_APP_URL=https://your-app.up.railway.app
TOKEN_ENCRYPTION_KEY=your_64_char_hex_key
```

> **Important:** Do **not** set a `PORT` variable — Railway assigns one automatically. Set `NEXT_PUBLIC_APP_URL` to your Railway domain (e.g. `https://xmomentslater-production.up.railway.app`). This is used for OAuth callbacks and the bookmarklet iframe.

### 3. Generate a Public Domain

In Railway dashboard → your service → **Settings** → **Networking** → **Generate Domain**. Copy the generated URL (e.g. `https://xmomentslater-production.up.railway.app`).

Go back to **Variables** and set `NEXT_PUBLIC_APP_URL` to this domain. Redeploy.

### 4. Update Supabase Auth Settings

1. Go to your [Supabase dashboard](https://supabase.com/dashboard) → **Authentication** → **URL Configuration**.
2. Set **Site URL** to your Railway domain:
   ```
   https://xmomentslater-production.up.railway.app
   ```
3. Add to **Redirect URLs**:
   ```
   https://xmomentslater-production.up.railway.app/auth/callback
   ```

### 5. Update X Developer Portal

1. Go to [developer.x.com](https://developer.x.com) → your app → **Settings** → **User authentication settings**.
2. Update the **Callback URI / Redirect URL** to:
   ```
   https://xmomentslater-production.up.railway.app/api/x/callback
   ```
3. Update the **Website URL** to your Railway domain.
4. Make sure **OAuth 2.0** is enabled with the **PKCE** method.

### 6. Verify

1. Visit your Railway domain — you should see the landing page.
2. Sign up, connect your X account — the OAuth flow should redirect back to your Railway URL.
3. Install the bookmarklet, save a post, verify it works.

## License

MIT
