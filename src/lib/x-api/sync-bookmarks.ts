import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTweet, type XApiTweetResponse } from "@/lib/parser";
import { generateSummary } from "@/lib/summarize";
import { generateTags } from "@/lib/generate-tags";
import { indexSavedPostVector } from "@/lib/vector-search";
import { fetchBookmarks, type BookmarksResponse } from "@/lib/x-api/fetch-bookmarks";
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

export interface SyncPageResult {
  synced: number;
  skipped: number;
  /** more bookmarks may be waiting on the next page */
  hasMore: boolean;
  /** pass this back in to fetch the next page; absent when hasMore is false */
  nextPaginationToken?: string;
}

async function touchLastSync(admin: SupabaseClient, userId: string): Promise<void> {
  await admin
    .from("x_connections")
    .update({ last_bookmark_sync_at: new Date().toISOString() })
    .eq("user_id", userId);
}

/**
 * Insert whichever tweets in `page` aren't already saved for this user.
 * Shared by both the single-page (manual, progress-reporting) and
 * multi-page (cron, unattended) sync entry points below.
 */
async function processBookmarkPage(
  page: BookmarksResponse,
  conn: SyncConnection,
  admin: SupabaseClient
): Promise<{ synced: number; skipped: number }> {
  let synced = 0;
  let skipped = 0;

  const tweets = page.data ?? [];
  const tweetIds = tweets.map((t) => t.id);
  const { data: existingRows } = await admin
    .from("saved_posts")
    .select("x_post_id")
    .eq("user_id", conn.user_id)
    .in("x_post_id", tweetIds);
  const existingIds = new Set<string>(existingRows?.map((r) => r.x_post_id) ?? []);

  for (const tweet of tweets) {
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

    // Bookmarks have no user-picked tags, so auto-tag every one — the
    // `source` column already distinguishes bookmarks from manual saves,
    // so both tag slots go to real topics instead of a "bookmark" label.
    let tags: string[] = [];
    try {
      tags = (await generateTags(textContent, title ?? undefined)) ?? [];
    } catch (err) {
      console.error(`Tag generation failed for tweet ${tweet.id}:`, err);
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
        tags,
        raw_api_response: singleResponse,
        parsed_content: parsed,
        kind: parsed.kind,
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
      continue;
    }

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
  }

  return { synced, skipped };
}

/**
 * Sync exactly one page (up to 100) of bookmarks. Lets a caller drive the
 * pagination loop itself and report progress between pages — used by the
 * user-triggered "Sync now" button.
 *
 * Smart/incremental by construction: bookmarks come back newest-bookmarked-
 * first, so `hasMore` goes false the moment a whole page turns out to
 * already be saved — everything older is guaranteed duplicate too. The X
 * bookmarks endpoint has no `since_id` filter, so this stand-in is what
 * makes the pull "only new ones."
 */
export async function syncUserBookmarksPage(
  conn: SyncConnection,
  admin: SupabaseClient,
  paginationToken?: string
): Promise<SyncPageResult> {
  const page = await withTokenRefresh(
    (token) => fetchBookmarks(token, conn.x_user_id, paginationToken),
    conn,
    conn.user_id,
    admin
  );

  if (!page.data || page.data.length === 0) {
    await touchLastSync(admin, conn.user_id);
    return { synced: 0, skipped: 0, hasMore: false };
  }

  const { synced, skipped } = await processBookmarkPage(page, conn, admin);
  await touchLastSync(admin, conn.user_id);

  // An all-duplicate page means every older page is a duplicate too.
  const nextToken = page.meta?.next_token;
  const hasMore = synced > 0 && !!nextToken;

  return {
    synced,
    skipped,
    hasMore,
    nextPaginationToken: hasMore ? nextToken : undefined,
  };
}

/**
 * Sync one user's X bookmarks into saved_posts, unattended, up to
 * `options.maxPages`. Used by the scheduled cron job — see
 * syncUserBookmarksPage for the progress-reporting, caller-driven version.
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

      const pageResult = await processBookmarkPage(page, conn, admin);
      synced += pageResult.synced;
      skipped += pageResult.skipped;

      paginationToken = page.meta?.next_token;
      pagesProcessed++;

      // Bookmarks return newest-first; an all-duplicate page means older
      // pages are guaranteed duplicates too, so we can skip them.
      if (pageResult.synced === 0) break;

      if (paginationToken && pagesProcessed >= options.maxPages) {
        pagesCapped = true;
        break;
      }
    } while (paginationToken);

    await touchLastSync(admin, conn.user_id);

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
