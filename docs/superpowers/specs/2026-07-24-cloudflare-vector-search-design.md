# Cloudflare Vector Search Design

## Goal

Add semantic search for saved X posts without using Supabase as the vector database. Build a Cloudflare-based semantic search sidecar now, while leaving the existing Supabase-backed app as the canonical product database until a later full migration.

## Scope

This phase indexes saved post text into Cloudflare Vectorize using OpenAI embeddings and exposes semantic search through a signed Cloudflare Worker API. The existing Next.js app continues to own authentication, saved post records, reader pages, and keyword search. The sidecar stores only the derived vector index and minimal metadata needed to filter and return matching post IDs.

Out of scope for this phase:

- Replacing Supabase Auth.
- Migrating canonical saved post storage from Supabase to D1.
- Rebuilding all API routes as Workers.
- Adding RAG answers or chat over the library.
- Indexing images or OCR content.

## Architecture

Create a Cloudflare Worker under `cloudflare/vector-search`. It has:

- `OPENAI_API_KEY` secret for embedding calls.
- `VECTOR_SEARCH_SECRET` secret for signed internal requests from Next.js.
- A Vectorize binding, for example `POST_VECTORS`.
- Routes for indexing, deletion, semantic query, and health checks.

The Worker treats OpenAI embeddings as the model source and Cloudflare Vectorize as the vector database. The Vectorize record ID is deterministic:

```text
${userId}:${postId}
```

The vector metadata is intentionally small:

```json
{
  "user_id": "uuid",
  "post_id": "uuid",
  "x_post_id": "string",
  "author_handle": "string",
  "title": "string | null",
  "source": "manual | bookmark",
  "saved_at": "iso timestamp"
}
```

Search requests include the user ID and query. The Worker embeds the query, filters Vectorize results by `user_id`, and returns scored post IDs. Next.js then fetches those IDs from the existing database and renders the normal library cards.

## Data Flow

### Save and Sync

When a post is saved manually or through bookmark sync, the existing app already parses text into `text_content`. After the database insert succeeds, Next.js sends the post to the Worker:

```json
{
  "postId": "saved_posts.id",
  "userId": "auth user id",
  "xPostId": "tweet id",
  "text": "parsed text content",
  "authorHandle": "handle",
  "title": "title or null",
  "source": "manual or bookmark",
  "savedAt": "iso timestamp"
}
```

Indexing is best-effort. If Vectorize indexing fails, saving the post still succeeds and logs the failure. A backfill job can repair missing vectors later.

### Refresh

The existing refresh endpoint recomputes `textContent`. This phase must also write `text_content` back to `saved_posts` and re-index the vector. This fixes the current stale keyword-search behavior at the same time.

### Delete

After deleting a saved post, Next.js calls the Worker delete route with `{ userId, postId }`. If the vector deletion fails, the database deletion remains successful and the failure is logged.

### Backfill

Add an admin-only backfill endpoint or script that reads existing saved posts with non-empty `text_content`, sends them to the Worker, and reports indexed/skipped/failed counts. The backfill should be resumable by accepting a limit/cursor or by processing in small pages.

## API Contract

All mutation/search routes require a shared secret header:

```text
Authorization: Bearer ${VECTOR_SEARCH_SECRET}
```

Worker routes:

- `GET /health` returns a simple status response.
- `POST /index-post` embeds and upserts one saved post.
- `POST /delete-post` deletes one vector ID.
- `POST /search` embeds the query and returns matching post IDs with scores.

Search response:

```json
{
  "matches": [
    { "postId": "uuid", "score": 0.82 }
  ]
}
```

## Embedding Model

Use OpenAI `text-embedding-3-small` initially. It is inexpensive and appropriate for short-to-medium saved post content. The Vectorize index dimensions must match the embedding dimensions chosen at index creation, so this model should be treated as a migration boundary. If the model changes later, create a new Vectorize index and re-backfill.

Long text should be truncated conservatively before embedding in this phase. Chunking can be added later if long X Articles need passage-level retrieval. For now, one vector per saved post keeps the UI and storage model simple.

## UI Behavior

Keep the existing library search input. Add semantic search with a minimal control rather than a new page:

- Default remains keyword search for predictable exact matching.
- Add a `Search mode` control with `Keyword` and `Semantic`.
- In semantic mode, the dashboard calls a Next.js API route such as `/api/search/semantic`.
- The API route authenticates the user, calls the Worker, fetches matching saved posts by ID, preserves Vectorize score ordering, and returns the same card shape used by the library view.

This avoids exposing Cloudflare secrets to the browser.

## Error Handling

- Missing Worker URL or secret disables semantic search server-side and returns a clear unavailable response.
- OpenAI or Vectorize errors do not block saving, syncing, refreshing, or deleting posts.
- Semantic search failures show a non-destructive UI error and leave existing library data intact.
- Empty or whitespace-only content is skipped during indexing.
- Empty search queries fall back to the normal library view.

## Security

The browser never calls the Worker directly. Next.js is the only caller and includes the shared secret. The Worker filters every search by `user_id` metadata so one user cannot retrieve another user's vectors. The Worker returns only post IDs and scores, not full post content.

## Verification

Implementation is complete when:

- The Worker type-checks/builds locally.
- Next.js lint/build passes.
- Save, bookmark sync, refresh, delete, and backfill call paths compile.
- Semantic search returns only the current user's posts.
- Keyword search still works.
- Refresh updates `text_content` as well as vector content.
- Failure of the Worker or OpenAI does not break saving posts.

Manual verification should include indexing at least two posts with related wording and confirming a conceptual query finds the expected one even without exact keyword overlap.
