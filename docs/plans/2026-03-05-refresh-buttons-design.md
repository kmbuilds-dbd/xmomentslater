# Refresh Buttons Design

## Goal

Add per-post refresh in the reader view and a "Refresh All" button in the library to re-fetch and re-parse all saved posts from the X API.

## Reader View — Always-visible Refresh Button

The reader already has `handleRefresh()` wired to `PUT /api/posts`. Currently only shown when content is empty/broken (conditional `needsRefresh` check).

**Change:** Always show a refresh icon button in the byline metadata area, next to the "Original" link. Remove the conditional dashed-box CTA.

## Library View — Refresh All

**New endpoint:** `POST /api/posts/refresh-all`
- Fetches all user's saved posts (id + x_post_id) from Supabase
- Gets user's X connection tokens once
- Iterates sequentially (respects X API rate limits)
- For each post: fetch from X API, re-parse, regenerate summary, update DB
- Skips failures and continues to next post
- Returns `{ refreshed: N, failed: N }`

**UI:** "Refresh All" button in library header area. Shows loading state with progress text ("Refreshing 3/12..."). Uses toast notification on completion.

## Files to Modify

1. `src/components/ReaderContent.tsx` — always show refresh button in byline
2. `src/app/api/posts/refresh-all/route.ts` — new endpoint (POST)
3. `src/components/LibraryView.tsx` — add Refresh All button with loading/progress state
