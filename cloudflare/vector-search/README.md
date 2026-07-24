# xMomentsLater Vector Search Worker

Cloudflare Worker sidecar for semantic search over saved X posts. The Next.js app calls this Worker with a shared secret; the Worker calls OpenAI embeddings and stores/query vectors in Cloudflare Vectorize.

Vector IDs use the saved post UUID. User ownership stays in Vectorize metadata through `user_id`, which is indexed for search filtering.

## Setup

Create the Vectorize index for OpenAI `text-embedding-3-small`:

```bash
npx wrangler vectorize create xmomentslater-post-vectors --dimensions=1536 --metric=cosine
```

Enable metadata filtering by `user_id` before inserting vectors:

```bash
npx wrangler vectorize create-metadata-index xmomentslater-post-vectors --property-name=user_id --type=string
```

Configure Worker secrets:

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put VECTOR_SEARCH_SECRET
```

Deploy:

```bash
npm install
npm run deploy
```

Set the deployed Worker URL and matching shared secret in the Next.js app:

```text
VECTOR_SEARCH_WORKER_URL=https://xmomentslater-vector-search.<your-subdomain>.workers.dev
VECTOR_SEARCH_SECRET=<same value as Worker secret>
SEMANTIC_BACKFILL_ADMIN_EMAILS=<comma-separated admin emails>
```

Run backfill in small batches by posting to `/api/search/backfill` while signed into the app as a listed admin.
