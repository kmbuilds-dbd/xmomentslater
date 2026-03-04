import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/encryption";
import { parseTweet, type XApiTweetResponse } from "@/lib/parser";
import { generateSummary } from "@/lib/summarize";
import { refreshAccessToken } from "@/lib/x-api/oauth";
import { fetchBookmarks, type BookmarksResponse } from "@/lib/x-api/fetch-bookmarks";

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
    .select("user_id, access_token, refresh_token, x_user_id");

  if (connError || !connections) {
    return NextResponse.json({ error: "Failed to fetch connections", details: connError }, { status: 500 });
  }

  const results: Array<{ userId: string; synced: number; skipped: number; error?: string }> = [];

  for (const conn of connections) {
    let synced = 0;
    let skipped = 0;

    try {
      let accessToken = decrypt(conn.access_token);

      // Fetch bookmarks with automatic token refresh on 401
      let page: BookmarksResponse;
      let pagesProcessed = 0;
      const maxPages = 2; // Cap at ~200 bookmarks per sync to respect rate limits

      let paginationToken: string | undefined;

      do {
        try {
          page = await fetchBookmarks(accessToken, conn.x_user_id, paginationToken);
        } catch (err: unknown) {
          // Refresh token on 401 and retry once
          if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
            console.log(`Token expired for user ${conn.user_id}, refreshing...`);
            const refreshToken = decrypt(conn.refresh_token);
            const newTokens = await refreshAccessToken(refreshToken);

            await admin
              .from("x_connections")
              .update({
                access_token: encrypt(newTokens.access_token),
                refresh_token: encrypt(newTokens.refresh_token),
                token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", conn.user_id);

            accessToken = newTokens.access_token;
            page = await fetchBookmarks(accessToken, conn.x_user_id, paginationToken);
          } else {
            throw err;
          }
        }

        if (!page.data || page.data.length === 0) break;

        // Process each bookmark
        for (const tweet of page.data) {
          // Build a single-tweet response shape for parseTweet
          const singleResponse: XApiTweetResponse = {
            data: tweet,
            includes: page.includes,
          };

          // Check for duplicates
          const { data: existing } = await admin
            .from("saved_posts")
            .select("id")
            .eq("user_id", conn.user_id)
            .eq("x_post_id", tweet.id)
            .maybeSingle();

          if (existing) {
            skipped++;
            continue;
          }

          // Parse content
          const parsed = parseTweet(singleResponse);

          // Extract title and text
          const title = parsed.blocks.find((b) => b.type === "heading")?.content ?? null;
          const textContent = parsed.blocks
            .filter((b) => b.type === "text")
            .map((b) => b.content)
            .join("\n\n");

          // Generate summary
          let summary: string | null = null;
          try {
            summary = await generateSummary(textContent, title ?? undefined);
          } catch (err) {
            console.error(`Summary generation failed for tweet ${tweet.id}:`, err);
          }

          // Build post URL from author info
          const author = page.includes?.users?.find((u) => u.id === tweet.author_id);
          const handle = author?.username ?? "unknown";
          const postUrl = `https://x.com/${handle}/status/${tweet.id}`;

          // Insert
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
            // Unique constraint = already saved (race condition)
            if (insertError.code === "23505") {
              skipped++;
            } else {
              console.error(`Insert error for tweet ${tweet.id}:`, insertError);
            }
          } else {
            synced++;
          }
        }

        paginationToken = page.meta?.next_token;
        pagesProcessed++;
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
