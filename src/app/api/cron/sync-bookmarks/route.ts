import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseTweet, type XApiTweetResponse } from "@/lib/parser";
import { generateSummary } from "@/lib/summarize";
import { fetchBookmarks } from "@/lib/x-api/fetch-bookmarks";
import { withTokenRefresh } from "@/lib/x-api/fetch-with-refresh";

export const maxDuration = 300; // 5 min max for Vercel

const MIN_SYNC_INTERVAL_MS = 23 * 60 * 60 * 1000;
const MAX_PAGES_PER_SYNC = 2;

interface SyncConnection {
  user_id: string;
  access_token: string;
  refresh_token: string;
  x_user_id: string;
  last_bookmark_sync_at: string | null;
}

type SyncResult =
  | { userId: string; status: "synced"; synced: number; skipped: number }
  | { userId: string; status: "throttled" }
  | { userId: string; status: "failed"; synced: number; skipped: number; error: string };

async function syncUser(
  conn: SyncConnection,
  admin: SupabaseClient
): Promise<SyncResult> {
  let synced = 0;
  let skipped = 0;

  try {
    let pagesProcessed = 0;
    let paginationToken: string | undefined;

    do {
      const page = await withTokenRefresh(
        (token) => fetchBookmarks(token, conn.x_user_id, paginationToken),
        conn,
        conn.user_id,
        admin
      );

      if (!page.data || page.data.length === 0) break;

      const tweetIds = page.data.map((t) => t.id);
      const { data: existingRows } = await admin
        .from("saved_posts")
        .select("x_post_id")
        .eq("user_id", conn.user_id)
        .in("x_post_id", tweetIds);
      const existingIds = new Set<string>(
        existingRows?.map((r) => r.x_post_id) ?? []
      );

      let newOnThisPage = 0;

      for (const tweet of page.data) {
        if (existingIds.has(tweet.id)) {
          skipped++;
          continue;
        }

        const singleResponse: XApiTweetResponse = {
          data: tweet,
          includes: page.includes,
        };
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

      // Bookmarks return newest-first; an all-duplicate page means older
      // pages are guaranteed duplicates too, so we can skip them.
      if (newOnThisPage === 0) break;
    } while (paginationToken && pagesProcessed < MAX_PAGES_PER_SYNC);

    await admin
      .from("x_connections")
      .update({ last_bookmark_sync_at: new Date().toISOString() })
      .eq("user_id", conn.user_id);

    return { userId: conn.user_id, status: "synced", synced, skipped };
  } catch (err) {
    console.error(`Bookmark sync failed for user ${conn.user_id}:`, err);
    return {
      userId: conn.user_id,
      status: "failed",
      synced,
      skipped,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function POST(request: NextRequest) {
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

  const { data: connections, error: connError } = await admin
    .from("x_connections")
    .select("user_id, access_token, refresh_token, x_user_id, last_bookmark_sync_at");

  if (connError || !connections) {
    return NextResponse.json({ error: "Failed to fetch connections", details: connError }, { status: 500 });
  }

  const now = Date.now();
  const throttled: SyncResult[] = [];
  const eligible: SyncConnection[] = [];

  for (const conn of connections as SyncConnection[]) {
    const last = conn.last_bookmark_sync_at;
    if (last && now - new Date(last).getTime() < MIN_SYNC_INTERVAL_MS) {
      throttled.push({ userId: conn.user_id, status: "throttled" });
    } else {
      eligible.push(conn);
    }
  }

  // Each user owns their own X rate-limit bucket, so users can run in parallel.
  const synced = await Promise.all(eligible.map((conn) => syncUser(conn, admin)));

  return NextResponse.json({ success: true, results: [...synced, ...throttled] });
}
