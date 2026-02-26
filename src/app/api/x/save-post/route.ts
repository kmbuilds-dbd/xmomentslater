import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import { extractPostId, extractArticleId, fetchTweet, parseTweet } from "@/lib/parser";

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

    // 5. Decrypt access token
    const accessToken = decrypt(connection.access_token);

    // 6. Fetch tweet from X API
    let rawResponse;
    try {
      rawResponse = await fetchTweet(postId, accessToken);
    } catch (err) {
      console.error("X API fetch error:", err);
      return NextResponse.json({ error: "Failed to fetch post from X" }, { status: 502 });
    }

    // 7. Parse into structured content
    let parsed = parseTweet(rawResponse);

    // 7b. If the tweet text is just an X Article/Note URL, fetch the article content
    const textBlock = parsed.blocks.find((b) => b.type === "text");
    const articleId = textBlock ? extractArticleId(textBlock.content) : null;
    if (articleId && parsed.blocks.filter((b) => b.type === "text").length === 1) {
      try {
        const articleRaw = await fetchTweet(articleId, accessToken);
        const articleParsed = parseTweet(articleRaw);
        // Only use article content if it has meaningful text (not just another URL)
        if (
          articleParsed.blocks.length > 0 &&
          articleParsed.blocks.some(
            (b) => b.type === "text" && !extractArticleId(b.content)
          )
        ) {
          // Merge: use article's text blocks but keep original author metadata
          parsed = {
            ...parsed,
            blocks: articleParsed.blocks,
          };
          // Also store the article raw response
          rawResponse = { ...rawResponse, _article: articleRaw };
        }
      } catch (err) {
        // Article fetch failed — keep original parsed content
        console.error("Article content fetch failed:", err);
      }
    }

    // 8. Store in database (admin client to bypass RLS for insert)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

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
