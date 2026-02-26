import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { generateSummary } from "@/lib/summarize";

/**
 * POST /api/posts/backfill-summaries
 *
 * Generates summaries for saved posts that don't have one yet.
 * Processes up to 20 posts per call to avoid timeouts.
 * Requires authentication — only backfills the current user's posts.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
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

    // Fetch posts missing summaries (oldest first, batch of 20)
    const { data: posts, error: fetchError } = await admin
      .from("saved_posts")
      .select("id, parsed_content, raw_api_response")
      .eq("user_id", user.id)
      .is("summary", null)
      .order("saved_at", { ascending: true })
      .limit(20);

    if (fetchError) {
      console.error("Backfill fetch error:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch posts" },
        { status: 500 }
      );
    }

    if (!posts || posts.length === 0) {
      return NextResponse.json({ updated: 0, remaining: 0 });
    }

    let updated = 0;

    for (const post of posts) {
      const parsed = post.parsed_content as {
        blocks?: { type: string; content: string }[];
      } | null;

      // Extract title and text from parsed content
      const title =
        parsed?.blocks?.find((b) => b.type === "heading")?.content ?? null;
      const textContent =
        parsed?.blocks
          ?.filter((b) => b.type === "text")
          .map((b) => b.content)
          .join("\n\n") ?? "";

      // Fall back to raw API text if parsed content is empty
      const fallbackText =
        textContent ||
        post.raw_api_response?.data?.note_tweet?.text ||
        post.raw_api_response?.data?.text ||
        "";

      if (!fallbackText.trim()) continue;

      try {
        const summary = await generateSummary(fallbackText, title ?? undefined);
        if (summary) {
          await admin
            .from("saved_posts")
            .update({ summary, ...(title ? { title } : {}) })
            .eq("id", post.id)
            .eq("user_id", user.id);
          updated++;
        }
      } catch (err) {
        console.error(`Summary generation failed for post ${post.id}:`, err);
      }
    }

    // Check how many remain
    const { count } = await admin
      .from("saved_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("summary", null);

    return NextResponse.json({ updated, remaining: count ?? 0 });
  } catch (err) {
    console.error("Backfill error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
