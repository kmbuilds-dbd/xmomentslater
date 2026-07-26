import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  mapSavedPostToLibraryPost,
  type SavedPostRow,
} from "@/lib/saved-posts";
import {
  isVectorSearchConfigured,
  searchSavedPostVectors,
} from "@/lib/vector-search";

const MAX_RESULTS = 100;

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

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const tag = request.nextUrl.searchParams.get("tag")?.trim() ?? "";
  const source = request.nextUrl.searchParams.get("source")?.trim() ?? "";
  const showRead = request.nextUrl.searchParams.get("showRead") === "true";
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
      .select(
        "id, author_name, author_handle, posted_at, saved_at, read_at, tags, x_post_url, parsed_content, raw_api_response, summary, title, source"
      )
      .in("id", ids);

    if (source === "manual" || source === "bookmark") {
      postQuery = postQuery.eq("source", source);
    }

    if (tag) {
      postQuery = postQuery.contains("tags", [tag]);
    }

    if (!showRead) {
      postQuery = postQuery.is("read_at", null);
    }

    const { data, error } = await postQuery;

    if (error) {
      console.error("Semantic search post lookup failed:", error);
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }

    const byId = new Map(
      (data ?? []).map((post) => [
        post.id,
        mapSavedPostToLibraryPost(post as SavedPostRow),
      ])
    );
    const posts = ids.map((id) => byId.get(id)).filter(Boolean);

    return NextResponse.json({ posts });
  } catch (err) {
    console.error("Semantic search failed:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 502 });
  }
}
