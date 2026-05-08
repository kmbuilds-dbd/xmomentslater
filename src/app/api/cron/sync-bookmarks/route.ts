import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { parseTweet, type XApiTweetResponse } from "@/lib/parser";
import { generateSummary } from "@/lib/summarize";
import { fetchBookmarks } from "@/lib/x-api/fetch-bookmarks";
import { withTokenRefresh } from "@/lib/x-api/fetch-with-refresh";

export const maxDuration = 300; // 5 min max for Vercel

export async function POST(request: NextRequest) {
  // Authenticate via CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  // Fetch all users with X connections
  const { data: connections, error: connError } = await admin
    .from("x_connections")
    .select("user_id, access_token, refresh_token, x_user_id, last_bookmark_sync_at");

  if (connError || !connections) {
    return NextResponse.json({ error: "Failed to fetch connections", details: connError }, { status: 500 });
  }

  // Skip users synced within the last 23 hours — once-a-day is plenty
  // and protects against duplicate cron triggers / manual re-runs.
  const MIN_SYNC_INTERVAL_MS = 23 * 60 * 60 * 1000;
  const now = Date.now();

  const results: Array<{ userId: string; synced: number; skipped: number; error?: string }> = [];

  for (const conn of connections) {
    if (
      conn.last_bookmark_sync_at &&
      now - new Date(conn.last_bookmark_sync_at).getTime() < MIN_SYNC_INTERVAL_MS
    ) {
      results.push({ userId: conn.user_id, synced: 0, skipped: 0, error: "throttled" });
      continue;
    }

    let synced = 0;
    let skipped = 0;

    try {
      let pagesProcessed = 0;
      const maxPages = 2; // First-sync catch-up; steady-state usually breaks after page 1
      let paginationToken: string | undefined;

      do {
        const page = await withTokenRefresh(
          (token) => fetchBookmarks(token, conn.x_user_id, paginationToken),
          conn,
          conn.user_id,
          admin
        );

        if (!page.data || page.data.length === 0) break;

        // Batch the existence check: one query per page instead of N.
        const tweetIds = page.data.map((t) => t.id);
        const { data: existingRows } = await admin
          .from("saved_posts")
          .select("x_post_id")
          .eq("user_id", conn.user_id)
          .in("x_post_id", tweetIds);
        const existingIds = new Set(existingRows?.map((r) => r.x_post_id) ?? []);

        let newOnThisPage = 0;

        for (const tweet of page.data) {
          const singleResponse: XApiTweetResponse = {
            data: tweet,
            includes: page.includes,
          };

          if (existingIds.has(tweet.id)) {
            skipped++;
            continue;
          }

          const parsed = parseTweet(singleResponse);

          const title = parsed.blocks.find((b) => b.type === "heading")?.content ?? null;
          const textContent = parsed.blocks
            .filter((b) => b.type === "text")
            .map((b) => b.content)
            .join("\n\n");

          let summary: string | null = null;
          try {
            summary = await generateSummary(textContent, title ?? undefined);
          } catch (err) {
            console.error(`Summary generation failed for tweet ${tweet.id}:`, err);
          }

          const author = page.includes?.users?.find((u) => u.id === tweet.author_id);
          const handle = author?.username ?? "unknown";
          const postUrl = `https://x.com/${handle}/status/${tweet.id}`;

          const { error: insertError } = await admin
            .from("saved_posts")
            .insert({
              user_id: conn.user_id,
              x_post_id: tweet.id,
              x_post_url: postUrl,
              author_name: parsed.author,
              author_handle: parsed.handle,
              posted_at: parsed.date,
              tags: ["bookmark"],
              raw_api_response: singleResponse,
              parsed_content: parsed,
              title,
              summary,
              source: "bookmark",
              text_content: textContent || null,
            });

          if (insertError) {
            // 23505 = unique constraint, treat as duplicate (race with concurrent save)
            if (insertError.code === "23505") {
              skipped++;
            } else {
              console.error(`Insert error for tweet ${tweet.id}:`, insertError);
            }
          } else {
            synced++;
            newOnThisPage++;
          }
        }

        paginationToken = page.meta?.next_token;
        pagesProcessed++;

        // Bookmarks come newest-first; if no new posts on this page, older
        // pages are guaranteed to also be all duplicates. Skip the next call.
        if (newOnThisPage === 0) break;
      } while (paginationToken && pagesProcessed < maxPages);

      // Update last sync timestamp
      await admin
        .from("x_connections")
        .update({ last_bookmark_sync_at: new Date().toISOString() })
        .eq("user_id", conn.user_id);

      results.push({ userId: conn.user_id, synced, skipped });
    } catch (err) {
      console.error(`Bookmark sync failed for user ${conn.user_id}:`, err);
      results.push({
        userId: conn.user_id,
        synced,
        skipped,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ success: true, results });
}
