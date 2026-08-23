import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTweet, type XApiTweetResponse } from "@/lib/parser";
import { generateSummary } from "@/lib/summarize";
import { indexSavedPostVector } from "@/lib/vector-search";
import { fetchBookmarks } from "@/lib/x-api/fetch-bookmarks";
import { withTokenRefresh } from "@/lib/x-api/fetch-with-refresh";

export interface SyncConnection {
  user_id: string;
  access_token: string;
  refresh_token: string;
  x_user_id: string;
  last_bookmark_sync_at: string | null;
}

export type SyncResult =
  | {
      userId: string;
      status: "synced";
      synced: number;
      skipped: number;
      /** true if more bookmarks may remain beyond the page cap we hit */
      pagesCapped: boolean;
    }
  | { userId: string; status: "throttled" }
  | {
      userId: string;
      status: "failed";
      synced: number;
      skipped: number;
      error: string;
    };

/**
 * Sync one user's X bookmarks into saved_posts.
 *
 * Smart/incremental by construction, not by an API-level "since" filter —
 * the X bookmarks endpoint doesn't support one. Instead: bookmarks come back
 * newest-bookmarked-first, so we page forward and stop the moment a whole
 * page is already in the DB (everything older is guaranteed to be a
 * duplicate too). Dedup happens twice: an upfront `x_post_id` existence
 * check per page (cheap, avoids wasted X API/LLM/embedding calls) and the
 * `saved_posts` unique constraint on (user_id, x_post_id) as a hard backstop
 * against races.
 */
export async function syncUserBookmarks(
  conn: SyncConnection,
  admin: SupabaseClient,
  options: { maxPages: number }
): Promise<SyncResult> {
  let synced = 0;
  let skipped = 0;

  try {
    let pagesProcessed = 0;
    let paginationToken: string | undefined;
    let pagesCapped = false;

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

        const { data: insertedPost, error: insertError } = await admin
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
          })
          .select("id, saved_at")
          .single();

        if (insertError) {
          if (insertError.code === "23505") {
            skipped++;
          } else {
            console.error(`Insert error for tweet ${tweet.id}:`, insertError);
          }
        } else {
          try {
            await indexSavedPostVector({
              postId: insertedPost.id,
              userId: conn.user_id,
              xPostId: tweet.id,
              text: textContent,
              authorHandle: parsed.handle,
              title,
              source: "bookmark",
              savedAt: insertedPost.saved_at,
            });
          } catch (err) {
            console.error(`Vector indexing failed for tweet ${tweet.id}:`, err);
          }
          synced++;
          newOnThisPage++;
        }
      }

      paginationToken = page.meta?.next_token;
      pagesProcessed++;

      // Bookmarks return newest-first; an all-duplicate page means older
      // pages are guaranteed duplicates too, so we can skip them.
      if (newOnThisPage === 0) break;

      if (paginationToken && pagesProcessed >= options.maxPages) {
        pagesCapped = true;
        break;
      }
    } while (paginationToken);

    await admin
      .from("x_connections")
      .update({ last_bookmark_sync_at: new Date().toISOString() })
      .eq("user_id", conn.user_id);

    return { userId: conn.user_id, status: "synced", synced, skipped, pagesCapped };
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
