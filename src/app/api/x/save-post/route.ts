import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { extractPostId, parseTweet } from "@/lib/parser";
import { generateSummary } from "@/lib/summarize";
import { fetchTweetWithRefresh } from "@/lib/x-api/fetch-with-refresh";

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse request body
    let url: string;
    let tags: string[];
    try {
      const body = await request.json();
      url = body.url;
      tags = Array.isArray(body.tags) ? body.tags.map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [];
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // 3. Validate URL and extract post ID
    const postId = extractPostId(url);
    if (!postId) {
      return NextResponse.json({ error: "Invalid X post URL" }, { status: 400 });
    }

    // 4. Get user's X connection (encrypted tokens)
    const { data: connection } = await supabase
      .from("x_connections")
      .select("access_token, refresh_token")
      .single();

    if (!connection) {
      return NextResponse.json({ error: "X account not connected" }, { status: 400 });
    }

    // 5. Admin client (needed for token refresh + DB insert)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    // 6. Fetch tweet — with automatic token refresh on 401
    let rawResponse;
    try {
      rawResponse = await fetchTweetWithRefresh({
        postId,
        connection,
        userId: user.id,
        admin,
      });
    } catch (err) {
      console.error("X API fetch error:", err);
      const message =
        err instanceof Error && err.message.includes("Token refresh failed")
          ? "X session expired. Please reconnect your X account in Settings."
          : "Failed to fetch post from X";
      const status = message.includes("expired") ? 401 : 502;
      return NextResponse.json({ error: message }, { status });
    }

    // 7. Parse into structured content (article field handles X Articles automatically)
    const parsed = parseTweet(rawResponse);

    // 8. Extract title and generate LLM summary
    const title =
      parsed.blocks.find((b) => b.type === "heading")?.content ?? null;
    const textContent = parsed.blocks
      .filter((b) => b.type === "text")
      .map((b) => b.content)
      .join("\n\n");
    let summary: string | null = null;
    try {
      summary = await generateSummary(textContent, title ?? undefined);
    } catch (err) {
      console.error("Summary generation failed:", err);
    }

    // 9. Store in database
    const { data: savedPost, error: dbError } = await admin
      .from("saved_posts")
      .insert({
        user_id: user.id,
        x_post_id: postId,
        x_post_url: url,
        author_name: parsed.author,
        author_handle: parsed.handle,
        posted_at: parsed.date,
        tags,
        raw_api_response: rawResponse,
        parsed_content: parsed,
        title,
        summary,
      })
      .select("id")
      .single();

    if (dbError) {
      // Unique constraint violation = duplicate
      if (dbError.code === "23505") {
        return NextResponse.json({ error: "Post already saved" }, { status: 409 });
      }
      console.error("DB insert error:", dbError);
      return NextResponse.json({ error: "Failed to save post" }, { status: 500 });
    }

    return NextResponse.json({ success: true, postId: savedPost.id });
  } catch (err) {
    console.error("Save post error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
