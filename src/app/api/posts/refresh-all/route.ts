import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { parseTweet } from "@/lib/parser";
import { generateSummary } from "@/lib/summarize";
import { fetchTweetWithRefresh } from "@/lib/x-api/fetch-with-refresh";

// POST — re-fetch and re-parse all saved posts
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get X connection tokens
    const { data: connection } = await supabase
      .from("x_connections")
      .select("access_token, refresh_token")
      .single();

    if (!connection) {
      return NextResponse.json(
        { error: "X account not connected" },
        { status: 400 }
      );
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    // Fetch all user's saved posts
    const { data: posts, error: fetchError } = await admin
      .from("saved_posts")
      .select("id, x_post_id")
      .eq("user_id", user.id)
      .order("saved_at", { ascending: false });

    if (fetchError || !posts) {
      console.error("Refresh-all fetch error:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch posts" },
        { status: 500 }
      );
    }

    let refreshed = 0;
    let failed = 0;

    // Process sequentially to respect X API rate limits
    for (const post of posts) {
      try {
        const rawResponse = await fetchTweetWithRefresh({
          postId: post.x_post_id,
          connection,
          userId: user.id,
          admin,
        });

        const parsed = parseTweet(rawResponse);

        const title =
          parsed.blocks.find((b) => b.type === "heading")?.content ?? null;
        const textContent = parsed.blocks
          .filter((b) => b.type === "text")
          .map((b) => b.content)
          .join("\n\n");

        let summary: string | null = null;
        try {
          summary = await generateSummary(textContent, title ?? undefined);
        } catch {
          // Summary failure is non-critical
        }

        await admin
          .from("saved_posts")
          .update({
            raw_api_response: rawResponse,
            parsed_content: parsed,
            author_name: parsed.author,
            author_handle: parsed.handle,
            posted_at: parsed.date,
            title,
            summary,
          })
          .eq("id", post.id)
          .eq("user_id", user.id);

        refreshed++;
      } catch (err) {
        console.error(`Refresh failed for post ${post.id}:`, err);
        failed++;
      }
    }

    return NextResponse.json({ refreshed, failed, total: posts.length });
  } catch (err) {
    console.error("POST /api/posts/refresh-all error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
