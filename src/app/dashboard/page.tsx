import { createClient } from "@/lib/supabase/server";
import { LibraryView } from "@/components/LibraryView";
import {
  mapSavedPostToLibraryPost,
  type SavedPostRow,
} from "@/lib/saved-posts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Parse query params
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const tag = typeof params.tag === "string" ? params.tag.trim() : "";
  const sort = typeof params.sort === "string" ? params.sort : "posted_desc";
  const showRead = typeof params.showRead === "string" ? params.showRead === "true" : false;
  const page = Math.max(
    1,
    parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1
  );

  // Build query with count for pagination
  const source = typeof params.source === "string" ? params.source : "";

  let query = supabase
    .from("saved_posts")
    .select(
      "id, author_name, author_handle, posted_at, saved_at, read_at, tags, x_post_url, parsed_content, raw_api_response, summary, title, source",
      { count: "exact" }
    );

  // Source filter (manual vs bookmark)
  if (source === "manual" || source === "bookmark") {
    query = query.eq("source", source);
  }

  // Search filter (author, title, summary, text content, tags)
  if (q) {
    // Sanitize for PostgREST filter syntax — strip characters that could break .or()
    const safeQ = q.replace(/[,()]/g, "");
    if (safeQ) {
      query = query.or(
        `author_name.ilike.%${safeQ}%,author_handle.ilike.%${safeQ}%,summary.ilike.%${safeQ}%,title.ilike.%${safeQ}%,text_content.ilike.%${safeQ}%`
      );
    }
  }

  // Tag filter (posts containing this tag)
  if (tag) {
    query = query.contains("tags", [tag]);
  }

  // Hide read posts by default
  if (!showRead) {
    query = query.is("read_at", null);
  }

  // Sort order
  if (sort === "unread") {
    // Unread posts first (read_at IS NULL → NULLS FIRST), then by posted_at desc
    query = query
      .order("read_at", { ascending: true, nullsFirst: true })
      .order("posted_at", { ascending: false, nullsFirst: false });
  } else if (sort === "saved_desc") {
    query = query.order("saved_at", { ascending: false });
  } else {
    // Default: newest posted first (preserves chronological order for synced bookmarks)
    query = query.order("posted_at", { ascending: false, nullsFirst: false });
  }

  // Pagination
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data: savedPosts, count } = await query;

  // Fetch all user tags for the filter UI, counted so we can surface the
  // most-used ones and leave the long tail searchable instead of cluttering
  // the bar (auto-tagging means most users end up with dozens of tags).
  const { data: tagRows } = await supabase
    .from("saved_posts")
    .select("tags");

  const tagCounts = new Map<string, number>();
  for (const row of tagRows ?? []) {
    for (const t of row.tags ?? []) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }
  const allTags = [...tagCounts.keys()].sort();
  const TOP_TAGS_COUNT = 10;
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_TAGS_COUNT)
    .map(([tag]) => tag);

  // Check if X is connected (for empty state message)
  const { data: xConnection } = await supabase
    .from("x_connections")
    .select("x_handle")
    .single();

  // Transform posts for the client component
  const posts = (savedPosts ?? []).map((post) =>
    mapSavedPostToLibraryPost(post as SavedPostRow)
  );

  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-tight mb-2">
        Your Library
      </h1>
      <p className="text-muted-foreground mb-8">
        {user?.email ? `Signed in as ${user.email}` : "Welcome"}
      </p>

      <LibraryView
        posts={posts}
        topTags={topTags}
        allTags={allTags}
        totalCount={totalCount}
        totalPages={totalPages}
        currentPage={page}
        currentSearch={q}
        currentTag={tag}
        currentSort={sort}
        currentSource={source}
        currentShowRead={showRead}
        hasXConnection={!!xConnection}
      />
    </main>
  );
}
