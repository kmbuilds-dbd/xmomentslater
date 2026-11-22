import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { parseTweet } from "@/lib/parser";
import { generateSummary } from "@/lib/summarize";
import {
  deleteSavedPostVector,
  indexSavedPostVector,
} from "@/lib/vector-search";
import { fetchTweetWithRefresh } from "@/lib/x-api/fetch-with-refresh";

// PATCH — mark read / unread, archive / unarchive
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, action } = await request.json();

    if (!id || !["read", "unread", "archive", "unarchive"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const update: Record<string, string | null> =
      action === "read"
        ? { read_at: new Date().toISOString() }
        : action === "unread"
          ? { read_at: null }
          : action === "archive"
            ? { archived_at: new Date().toISOString() }
            : { archived_at: null };

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    const { error: dbError } = await admin
      .from("saved_posts")
      .update(update)
      .eq("id", id)
      .eq("user_id", user.id);

    if (dbError) {
      console.error("Mark read error:", dbError);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/posts error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT — re-fetch and re-parse a post's content
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "Missing post id" }, { status: 400 });
    }

    // Fetch the existing post
    const { data: post } = await supabase
      .from("saved_posts")
      .select("x_post_id, raw_api_response, source, saved_at")
      .eq("id", id)
      .single();

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.source === "ifttt") {
      return NextResponse.json({ error: "IFTTT posts cannot be refreshed from X. Open the original post instead." }, { status: 400 });
    }

    // Get X connection tokens (including refresh_token for auto-refresh)
    const { data: connection } = await supabase
      .from("x_connections")
      .select("access_token, refresh_token")
      .single();

    if (!connection) {
      return NextResponse.json({ error: "X account not connected" }, { status: 400 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    // Re-fetch from X API with automatic token refresh on 401
    let rawResponse;
    try {
      rawResponse = await fetchTweetWithRefresh({
        postId: post.x_post_id,
        connection,
        userId: user.id,
        admin,
      });
    } catch (err) {
      console.error("Re-fetch error:", err);
      const message =
        err instanceof Error && err.message.includes("Token refresh failed")
          ? "X session expired. Please reconnect your X account in Settings."
          : "Failed to fetch post from X";
      const status = message.includes("expired") ? 401 : 502;
      return NextResponse.json({ error: message }, { status });
    }

    // Re-parse (article field in tweet.fields handles X Articles automatically)
    const parsed = parseTweet(rawResponse);

    // Regenerate title and summary
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
      console.error("Summary regeneration failed:", err);
    }

    // Update in database
    const { error: dbError } = await admin
      .from("saved_posts")
      .update({
        raw_api_response: rawResponse,
        parsed_content: parsed,
        author_name: parsed.author,
        author_handle: parsed.handle,
        posted_at: parsed.date,
        title,
        summary,
        text_content: textContent || null,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (dbError) {
      console.error("Re-parse update error:", dbError);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    try {
      await indexSavedPostVector({
        postId: id,
        userId: user.id,
        xPostId: post.x_post_id,
        text: textContent,
        authorHandle: parsed.handle,
        title,
        source: post.source,
        savedAt: post.saved_at,
      });
    } catch (err) {
      console.error("Vector re-indexing failed:", err);
    }

    return NextResponse.json({ success: true, parsed });
  } catch (err) {
    console.error("PUT /api/posts error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — remove a saved post
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Missing post id" }, { status: 400 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    const { error: dbError } = await admin
      .from("saved_posts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (dbError) {
      console.error("Delete post error:", dbError);
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }

    try {
      await deleteSavedPostVector({ postId: id, userId: user.id });
    } catch (err) {
      console.error("Vector deletion failed:", err);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/posts error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
