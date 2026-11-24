import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  mapSavedPostToReaderPost,
  type ReaderPost,
} from "@/lib/reader";
import type { SavedPostRow } from "@/lib/saved-posts";
import {
  isVectorSearchConfigured,
  searchSavedPostVectors,
} from "@/lib/vector-search";

const MAX_RESULTS = 100;
const COLS =
  "id, author_name, author_handle, posted_at, saved_at, read_at, tags, x_post_url, parsed_content, raw_api_response, summary, title, source, category, kind";

const DATE_RANGES: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isVectorSearchConfigured()) {
    return NextResponse.json({ posts: [], unavailable: true });
  }

  const sp = request.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const tag = sp.get("tag")?.trim() ?? "";
  const type = sp.get("type")?.trim() ?? "";
  const date = sp.get("date")?.trim() ?? "";
  const year = sp.get("year")?.trim() ?? "";
  const author = sp.get("author")?.trim() ?? "";
  const showRead = sp.get("showRead") === "true";

  if (!q) {
    return NextResponse.json({ posts: [] });
  }

  try {
    const matches = await searchSavedPostVectors({
      userId: user.id,
      query: q,
      limit: MAX_RESULTS,
    });

    const ids = matches.map((match) => match.postId);
    if (ids.length === 0) {
      return NextResponse.json({ posts: [] });
    }

    let postQuery = supabase
      .from("saved_posts")
      .select(COLS)
      .in("id", ids)
      .is("archived_at", null);

    if (tag) postQuery = postQuery.contains("tags", [tag]);
    if (["article", "video", "image", "text"].includes(type)) {
      postQuery = postQuery.eq("kind", type);
    }
    if (DATE_RANGES[date]) {
      const since = new Date(Date.now() - DATE_RANGES[date] * 86400000).toISOString();
      postQuery = postQuery.gte("saved_at", since);
    }
    if (/^\d{4}$/.test(year)) {
      postQuery = postQuery
        .gte("posted_at", `${year}-01-01T00:00:00.000Z`)
        .lt("posted_at", `${Number(year) + 1}-01-01T00:00:00.000Z`);
    }
    if (author) postQuery = postQuery.eq("author_handle", author);
    if (!showRead) postQuery = postQuery.is("read_at", null);

    const { data, error } = await postQuery;

    if (error) {
      console.error("Semantic search post lookup failed:", error);
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }

    const byId = new Map<string, ReaderPost>(
      (data ?? []).map((post) => [
        post.id,
        mapSavedPostToReaderPost(post as SavedPostRow),
      ])
    );
    const posts = ids.map((id) => byId.get(id)).filter(Boolean);

    return NextResponse.json({ posts });
  } catch (err) {
    console.error("Semantic search failed:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 502 });
  }
}
