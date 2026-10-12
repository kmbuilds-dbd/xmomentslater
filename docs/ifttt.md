# Save liked X posts with IFTTT

## Rollout

1. Apply `supabase/migrations/006_category.sql` to the Supabase database before deploying this code. Existing posts retain a null category.
2. Deploy the app with the existing Supabase environment variables and public HTTPS `NEXT_PUBLIC_APP_URL`. `ANTHROPIC_API_KEY` enables enrichment; vector-search settings enable semantic indexing. Neither is required to save text.
3. Open Settings → Save likes with IFTTT. Copy the endpoint, Authorization header and escaped body into an applet.
4. Like a new post, check IFTTT activity and confirm it appears in your library. Repeat delivery should not create another copy.
5. Scheduled GitHub bookmark sync is disabled in this change. Manual dispatch and the old X capture paths remain available and still use the X API. Cancel your X developer subscription only after a real applet delivery works. This code does not cancel subscriptions or disconnect accounts.

## Applet

IF THIS: X (Twitter) → **New liked tweet by you**.

THEN THAT: Webhooks → **Make a web request**:

- URL: `https://YOUR_APP/api/ifttt/ingest`
- Method: `POST`
- Content Type: `application/json`
- Additional Headers: `Authorization: Bearer YOUR_SETTINGS_TOKEN`
- Body:

```json
{
  "text": "<<<{{Text}}>>>",
  "author": "<<<{{UserName}}>>>",
  "url": "<<<{{LinkToTweet}}>>>",
  "created_at": "<<<{{CreatedAt}}>>>"
}
```

Use IFTTT's ingredient picker for the four values. Keep `<<<` and `>>>` **inside the JSON quotes**: Webhooks uses these markers to escape quotes and line breaks in ingredients. `UserName` is the author's handle, not their display name. The token is the existing per-user feed token, also used by the save API; treat it as a password and never put it in the URL or body.

## Behavior

The endpoint authenticates a feed token and saves only to that user's library. It validates text, author, X post URL and date, normalizes the URL, and deduplicates by user and X post ID (including across manual/bookmark saves). Repeated delivery succeeds without overwriting existing content. The database unique constraint handles concurrent duplicates. The winning delivery inserts readable text before enrichment, so concurrent retries do not multiply AI calls.

One optional Anthropic request produces summary, two topical tags and a broad category. Failure leaves the original readable text intact. Semantic indexing follows the existing best-effort vector pipeline; failures can be repaired with the existing vector backfill. IFTTT posts cannot refresh through the X API. Use Original to read more.

HTTP errors: 400 malformed payload, 401 missing/invalid token, 413 oversized body, 415 unsupported content type, 500 server/database failure. Successful repeated deliveries return 200. Do not include a `user_id`; the Bearer token determines ownership.

## Verification

Run `npm test`, `npm run lint`, and `npm run build`. Tests cover payload validation, bounded requests, auth, ownership, duplicate races, enrichment fallback, safe reader output and blocking X refresh. A production build requires configured public Supabase values and access to Google Fonts.

## Limits and references

IFTTT lists the [liked tweet trigger](https://ifttt.com/twitter/triggers/new_favorite_tweet) with Text, UserName, LinkToTweet and CreatedAt ingredients. [Webhooks](https://help.ifttt.com/hc/en-us/articles/115010230347-Webhooks-service-FAQ) requires a paid plan. Pro [polling is expected within five minutes](https://help.ifttt.com/hc/en-us/articles/4412435510171-What-is-the-difference-between-polling-Applets-and-realtime-Applets); it is not a delivery guarantee. [The Webhooks action](https://ifttt.com/maker_webhooks/actions/make_web_request) documents custom headers and ingredient escaping.

The app can save only the supplied text. Full X Notes/Articles and images cannot be reconstructed from these ingredients. No unofficial scraping fallback is included. Trigger listing does not prove delivery for your particular X account; test before cancelling paid access.
