import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import { fetchTweet, parseTweet } from "@/lib/parser";
import { generateSummary } from "@/lib/summarize";

// PATCH — mark read / unread
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

    if (!id || !["read", "unread"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
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
      .update({ read_at: action === "read" ? new Date().toISOString() : null })
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
      .select("x_post_id, raw_api_response")
      .eq("id", id)
      .single();

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Get X connection token
    const { data: connection } = await supabase
      .from("x_connections")
      .select("access_token")
      .single();

    if (!connection) {
      return NextResponse.json({ error: "X account not connected" }, { status: 400 });
    }

    const accessToken = decrypt(connection.access_token);

    // Re-fetch from X API (now includes article field)
    let rawResponse;
    try {
      rawResponse = await fetchTweet(post.x_post_id, accessToken);
    } catch (err) {
      console.error("Re-fetch error:", err);
      return NextResponse.json({ error: "Failed to fetch post from X" }, { status: 502 });
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
      .update({
        raw_api_response: rawResponse,
        parsed_content: parsed,
        author_name: parsed.author,
        author_handle: parsed.handle,
        posted_at: parsed.date,
        title,
        summary,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (dbError) {
      console.error("Re-parse update error:", dbError);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
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

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/posts error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
