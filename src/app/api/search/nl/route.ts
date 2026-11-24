import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapSavedPostToReaderPost } from "@/lib/reader";
import { getGeminiKey, interpretSearchQuery } from "@/lib/ai";
import type { SavedPostRow } from "@/lib/saved-posts";

const COLS =
  "id, author_name, author_handle, posted_at, saved_at, read_at, tags, x_post_url, parsed_content, raw_api_response, summary, title, source, category, kind";

// GET — natural-language search. Gemini interprets the query into tags +
// terms, then we match those against the user's library.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ posts: [] });
  }

  const apiKey = await getGeminiKey(user.id);
  if (!apiKey) {
    return NextResponse.json(
      { error: "Set your Gemini API key in Settings to use natural-language search." },
      { status: 400 }
    );
  }

  // Distinct tags so the model maps intent to the user's actual vocabulary.
  const { data: tagRows } = await supabase
    .from("saved_posts")
    .select("tags")
    .is("archived_at", null);
  const allTags = [
    ...new Set((tagRows ?? []).flatMap((r) => r.tags ?? [])),
  ];

  let tags: string[] = [];
  let terms: string[] = [];
  try {
    const parsed = await interpretSearchQuery(apiKey, q, allTags);
    tags = parsed.tags;
    terms = parsed.terms;
  } catch (err) {
    console.error("Search interpretation failed:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 502 });
  }

  if (!tags.length && !terms.length) {
    return NextResponse.json({ posts: [] });
  }

  const byId = new Map<string, SavedPostRow>();

  if (tags.length) {
    const { data } = await supabase
      .from("saved_posts")
      .select(COLS)
      .overlaps("tags", tags)
      .is("archived_at", null)
      .limit(200);
    for (const p of data ?? []) byId.set(p.id, p as SavedPostRow);
  }

  if (terms.length) {
    const safe = terms.map((t) => t.replace(/[,()]/g, "")).filter(Boolean);
    if (safe.length) {
      const or = safe
        .map(
          (t) =>
            `text_content.ilike.%${t}%,title.ilike.%${t}%,summary.ilike.%${t}%`
        )
        .join(",");
      const { data } = await supabase
        .from("saved_posts")
        .select(COLS)
        .or(or)
        .is("archived_at", null)
        .limit(200);
      for (const p of data ?? []) byId.set(p.id, p as SavedPostRow);
    }
  }

  const posts = [...byId.values()].map((p) =>
    mapSavedPostToReaderPost(p as SavedPostRow)
  );
  return NextResponse.json({ posts });
}
