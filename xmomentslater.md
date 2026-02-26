# xMomentsLater — Product Spec

**A distraction-free read-later app for X (Twitter) content.**

---

## Problem

X has become a serious platform for long-form writing — long posts, X Notes, in-depth threads. But the platform is engineered to keep you in the feed. Replies, trending topics, and the algorithm pull you away before you finish reading. There's no way to save X content and read it later in a clean environment, the way Instapaper or Pocket work for articles.

---

## Solution

xMomentsLater is a read-it-later web app purpose-built for X content. One click saves any post to your personal library. You read it later in a clean, typographic reader with no feeds, no comments, no engagement metrics — just text and images.

---

## Target User

Someone who follows thoughtful writers on X and wants to read their long-form content seriously, without the platform pulling them into doom scrolling.

---

## Core Features (v1)

### 1. Bookmarklet
A browser bookmarklet the user installs once. When on any `x.com` post URL, clicking it:
- Sends the URL to the xMomentsLater backend
- Authenticates via the user's stored session
- Fetches and parses the post
- Shows a lightweight "Saved!" toast confirmation
- Returns the user to X — no redirect, no friction

### 2. Content Types Supported (v1)
- Single long posts
- X Notes (long-form articles published on X)
- Posts with embedded images

> **Out of scope for v1:** Multi-post threads. This adds significant complexity and can ship as a follow-on feature.

### 3. Library View
A clean list of saved posts. Each item shows:
- Author name and handle
- First ~100 characters of the post
- Date saved
- Read / unread status

Sorted by newest saved or oldest unread — user's choice. No algorithmic sorting. Searchable by author or keyword.

### 4. Reader View
The heart of the app. A distraction-free reading experience:
- Centered content column, ~65–70 characters wide
- Comfortable line height, clean serif or sans-serif font
- Light and dark mode
- Author name, handle, and post date shown unobtrusively at the top
- Text flows naturally, images render inline at reading width
- Reading progress indicator (subtle top bar or estimated read time)

**Stripped entirely:** like counts, retweet counts, reply prompts, related posts, engagement overlays.

### 5. User Auth
Email/password or OAuth-based sign-up. Each user has a private library — no social features, no sharing.

### 6. X Account Connection
Users connect their X account via OAuth 2.0 (PKCE flow). Their access token and refresh token are stored encrypted in the database. The app uses this token to fetch post content via the X API on their behalf, staying within their personal rate limits.

---

## Content Parsing Pipeline

Raw X API responses require processing before they're readable. The pipeline:

1. **Fetch** — Call X API using the user's OAuth token with the post ID extracted from the URL
2. **Extract** — Pull post text, entity objects (URLs, mentions), and media attachments
3. **Clean** — Strip engagement metadata, reconstruct text with proper formatting, resolve shortened URLs
4. **Structure** — Output a clean JSON document: `{ author, handle, date, blocks: [{ type: "text"|"image", content }] }`
5. **Store** — Save raw API response and parsed document to the database

X Notes return as HTML/markdown from the API and are straightforward to render. Regular long posts are plain text with entity objects that get stitched back together.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js + Tailwind | SSR for reader performance, great deployment story |
| Backend | Next.js API routes | No separate server needed for v1 |
| Database | Supabase (Postgres) | Built-in auth, row-level security, minimal setup |
| X Auth | OAuth 2.0 with PKCE | User-level access, user owns their rate limits |
| Hosting | Vercel | Zero-config, free tier sufficient to start |

---

## Data Model (simplified)

**users** — managed by Supabase Auth

**x_connections**
- `user_id` (FK)
- `access_token` (encrypted)
- `refresh_token` (encrypted)
- `x_handle`
- `connected_at`

**saved_posts**
- `id`
- `user_id` (FK)
- `x_post_id`
- `x_post_url`
- `author_name`
- `author_handle`
- `posted_at`
- `saved_at`
- `read_at` (null if unread)
- `raw_api_response` (JSONB)
- `parsed_content` (JSONB — structured blocks)

---

## Build Order

1. **Auth + Supabase setup** — user sign-up, sign-in, session management
2. **X OAuth connection flow** — connect X account, store tokens securely
3. **Bookmarklet + save endpoint** — URL → post ID → fetch → store
4. **Content parser** — single posts and X Notes → clean JSON blocks
5. **Library view** — list of saved posts, read/unread state, search
6. **Reader view** — clean typographic display of parsed content

**Estimated timeline:** 4–6 weeks as a side project at a comfortable pace.

---

## Future Features (post-v1)

- Thread support (multi-post chains by same author)
- Highlight + annotate text in the reader
- Reading progress sync across devices
- Archive / delete / tag saved posts
- Export to Markdown or Obsidian
- Browser extension (replaces bookmarklet with one-click toolbar button)
- Email digest of unread saves

---

## Name

**xMomentsLater** — a nod to "read later" and the idea of capturing a moment worth returning to, without the noise.
