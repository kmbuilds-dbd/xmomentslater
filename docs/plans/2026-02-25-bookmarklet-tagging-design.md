# Bookmarklet + Save Endpoint + Tagging — Design

**Date:** 2025-02-25
**Status:** Approved
**Build order step:** 3 (Bookmarklet + save endpoint) + 4 (Content parser)

---

## Overview

Add the ability to save X posts via a browser bookmarklet with optional freeform tagging. An iframe-based popup appears on the X page, showing a tag picker and Save button. The backend fetches and parses the post via the X API, then stores it with tags.

---

## Data Model

### `saved_posts` table

```sql
CREATE TABLE saved_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  x_post_id       text NOT NULL,
  x_post_url      text NOT NULL,
  author_name     text,
  author_handle   text,
  posted_at       timestamptz,
  saved_at        timestamptz DEFAULT now(),
  read_at         timestamptz,
  tags            text[] DEFAULT '{}',
  raw_api_response jsonb,
  parsed_content  jsonb,
  UNIQUE(user_id, x_post_id)
);
```

- RLS enabled: users can only access their own rows (SELECT, INSERT, UPDATE, DELETE).
- GIN index on `tags` for fast containment queries.
- `read_at` null means unread.
- `parsed_content` holds structured blocks: `{ author, handle, date, blocks: [{ type: "text"|"image", content }] }`.

### Tag queries

No separate tags table. User's existing tags are derived via:

```sql
SELECT DISTINCT unnest(tags) FROM saved_posts WHERE user_id = ?
```

Approach A (text array) chosen for simplicity. Can migrate to junction table if tag metadata is needed later.

---

## Bookmarklet

### Approach: iframe overlay

The bookmarklet injects a fixed-position iframe pointing to `{APP_URL}/bookmarklet?url={encoded_url}` onto the X page.

**Why iframe:**
- Auth cookies sent automatically (same origin as app)
- No CSS conflicts with X's styles
- The popup is a real Next.js page with full app context
- `/api/tags` call works without CORS issues

### Bookmarklet code

One-liner that creates and appends the iframe:

```javascript
javascript:void((function(){
  var d=document,f=d.createElement('iframe');
  f.src='APP_URL/bookmarklet?url='+encodeURIComponent(d.location.href);
  f.style.cssText='position:fixed;top:16px;right:16px;width:340px;height:280px;border:none;border-radius:12px;z-index:2147483647;box-shadow:0 8px 32px rgba(0,0,0,.25)';
  f.id='xml-bookmarklet';
  d.body.appendChild(f);
})())
```

### Bookmarklet page (`/bookmarklet/page.tsx`)

- Reads `url` from query params
- Validates it's an `x.com` or `twitter.com` URL
- Fetches user's existing tags from `GET /api/tags`
- Renders tag picker UI:
  - Existing tags as clickable chips
  - Text input to type new tag (Enter or comma to add)
  - Save button, Cancel (X) button
- Tags are optional — user can save with no tags
- On Save: POST to `/api/x/save-post` with `{ url, tags }`
- On success: shows "Saved!" confirmation, auto-dismisses after ~1.5s
- Uses `postMessage` to tell parent window to remove the iframe

---

## API Endpoints

### `POST /api/x/save-post`

**Request:** `{ url: string, tags: string[] }`

**Flow:**
1. Authenticate user from session
2. Validate URL is `x.com` or `twitter.com`
3. Extract post ID from URL
4. Check for duplicate (`user_id` + `x_post_id` unique constraint) — return friendly error if duplicate
5. Fetch user's encrypted X OAuth token from `x_connections`
6. Decrypt token, call X API v2 `GET /2/tweets/{id}` with expansions
7. Run content parser pipeline
8. Insert into `saved_posts` with parsed content + tags
9. Return `{ success: true, postId }`

### `GET /api/tags`

**Response:** `{ tags: string[] }`

Returns user's distinct tags across all saved posts. No pagination.

---

## Content Parser (`src/lib/parser/`)

Minimal v1 pipeline:

1. **Extract post ID** — handle `x.com` and `twitter.com` URL formats, with or without query params
2. **Fetch tweet** — X API v2 `GET /2/tweets/{id}` with:
   - `tweet.fields=text,created_at,author_id,entities,note_tweet`
   - `expansions=author_id,attachments.media_keys`
   - `user.fields=name,username,profile_image_url`
   - `media.fields=url,preview_image_url,type,width,height`
3. **Parse** — extract author from includes, text from `note_tweet.text` (long posts) or `data.text`, media URLs from includes
4. **Structure** — output:
   ```json
   {
     "author": "Display Name",
     "handle": "username",
     "date": "2025-02-25T...",
     "blocks": [
       { "type": "text", "content": "Post text..." },
       { "type": "image", "content": "https://pbs.twimg.com/..." }
     ]
   }
   ```
5. **Store** — save both `raw_api_response` and `parsed_content` to `saved_posts`

### URL parsing

Handle these formats:
- `https://x.com/user/status/123456`
- `https://twitter.com/user/status/123456`
- With query params (`?s=20`, `?t=...`)
- With trailing slashes

### Scope

- Single posts and X Notes (long-form)
- Posts with images
- **Out of scope:** threads (multi-post chains)

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Tag storage | `text[]` column | Simplest for freeform tags, good Postgres support |
| Bookmarklet UI | iframe overlay | Auth cookies, no CSS conflicts, real Next.js page |
| Tags required? | Optional | Zero friction for quick saves |
| Tag suggestions | Show existing tags as chips | Reduces duplicates without autocomplete complexity |
| Duplicate handling | Friendly error | Don't crash, tell user it's already saved |
