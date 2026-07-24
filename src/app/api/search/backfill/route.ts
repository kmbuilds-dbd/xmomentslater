import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { indexSavedPostVector } from "@/lib/vector-search";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmails = (process.env.SEMANTIC_BACKFILL_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!user.email || !adminEmails.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 100);
  const cursor = typeof body.cursor === "string" ? body.cursor : undefined;

  let query = supabase
    .from("saved_posts")
    .select("id, user_id, x_post_id, author_handle, title, source, saved_at, text_content")
    .not("text_content", "is", null)
    .order("saved_at", { ascending: true })
    .limit(limit);

  if (cursor) {
    query = query.gt("saved_at", cursor);
  }

  const { data: posts, error } = await query;
  if (error) {
    console.error("Semantic backfill lookup failed:", error);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }

  let indexed = 0;
  let skipped = 0;
  let failed = 0;

  for (const post of posts ?? []) {
    if (!post.text_content?.trim()) {
      skipped++;
      continue;
    }

    try {
      await indexSavedPostVector({
        postId: post.id,
        userId: post.user_id,
        xPostId: post.x_post_id,
        text: post.text_content,
        authorHandle: post.author_handle,
        title: post.title,
        source: post.source,
        savedAt: post.saved_at,
      });
      indexed++;
    } catch (err) {
      failed++;
      console.error(`Semantic backfill failed for ${post.id}:`, err);
    }
  }

  const last = posts?.at(-1);

  return NextResponse.json({
    success: true,
    indexed,
    skipped,
    failed,
    nextCursor: last?.saved_at ?? null,
  });
}
