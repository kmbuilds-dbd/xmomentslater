import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAnthropicConfigured } from "@/lib/anthropic-client";
import { generateTagsDebug, TAGS_MIN_LENGTH } from "@/lib/generate-tags";
import { isBackfillAdmin } from "@/lib/backfill-auth";

/** A post counts as "missing tags" if it has none, or only the old generic
 * "bookmark" placeholder tag that sync used to assign (source already
 * distinguishes bookmarks from manual saves, so that tag carried no
 * real information). Anything the user actually tagged is left alone. */
function needsTags(tags: string[] | null): boolean {
  if (!tags) return true;
  const normalized = tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  return normalized.length === 0 || (normalized.length === 1 && normalized[0] === "bookmark");
}

// POST — walk existing saved_posts and assign two topical tags to any post
// that's missing real ones. Paginated like /api/search/backfill; call
// repeatedly with the returned nextCursor until it comes back null.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isBackfillAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fail fast and say so, instead of quietly "succeeding" with 0 tagged —
  // generateTags degrades to null with no error when this is missing.
  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "Tag generation isn't configured: ANTHROPIC_API_KEY is missing on the server." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 100);
  const cursor = typeof body.cursor === "string" ? body.cursor : undefined;

  let query = supabase
    .from("saved_posts")
    .select("id, title, tags, saved_at, text_content")
    .order("saved_at", { ascending: true })
    .limit(limit);

  if (cursor) {
    query = query.gt("saved_at", cursor);
  }

  const { data: posts, error } = await query;
  if (error) {
    console.error("Tags backfill lookup failed:", error);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }

  let tagged = 0;
  let alreadyTagged = 0;
  let noText = 0;
  let tooShort = 0;
  let failed = 0;
  let sampleError: string | null = null;

  for (const post of posts ?? []) {
    if (!needsTags(post.tags)) {
      alreadyTagged++;
      continue;
    }
    const text = post.text_content?.trim() ?? "";
    if (!text) {
      noText++;
      continue;
    }
    if (text.length < TAGS_MIN_LENGTH) {
      tooShort++;
      continue;
    }

    const { tags, error: tagError } = await generateTagsDebug(text, post.title ?? undefined);
    if (!tags) {
      failed++;
      if (tagError && !sampleError) sampleError = tagError;
      console.error(`Tags backfill failed for ${post.id}: ${tagError}`);
      continue;
    }

    const { error: updateError } = await supabase
      .from("saved_posts")
      .update({ tags })
      .eq("id", post.id);

    if (updateError) {
      failed++;
      if (!sampleError) sampleError = updateError.message;
      console.error(`Tags backfill update failed for ${post.id}:`, updateError);
    } else {
      tagged++;
    }
  }

  const last = posts?.at(-1);

  return NextResponse.json({
    success: true,
    tagged,
    alreadyTagged,
    noText,
    tooShort,
    failed,
    sampleError,
    skipped: alreadyTagged + noText + tooShort,
    nextCursor: last?.saved_at ?? null,
  });
}
