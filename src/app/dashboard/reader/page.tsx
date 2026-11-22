import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExploreClient } from "@/components/ExploreClient";
import {
  mapSavedPostToReaderPost,
  isActionable,
  type SmartSection,
} from "@/lib/reader";
import type { SavedPostRow } from "@/lib/saved-posts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const COLS =
  "id, author_name, author_handle, posted_at, saved_at, read_at, tags, x_post_url, parsed_content, raw_api_response, summary, title, source, category, kind";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const DATE_RANGES: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export default async function ReaderPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const q = typeof params.q === "string" ? params.q.trim() : "";
  const tag = typeof params.tag === "string" ? params.tag.trim() : "";
  const read = typeof params.read === "string" ? params.read === "1" : false;
  const type = typeof params.type === "string" ? params.type : "";
  const date = typeof params.date === "string" ? params.date : "";
  const year = typeof params.year === "string" ? params.year : "";
  const author = typeof params.author === "string" ? params.author : "";
  const sort = typeof params.sort === "string" ? params.sort : "imported";
  const order = typeof params.order === "string" ? params.order : "desc";
  const page = Math.max(
    1,
    parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1
  );

  // Feed: non-archived posts with optional filters.
  let feedQuery = supabase
    .from("saved_posts")
    .select(COLS, { count: "exact" })
    .is("archived_at", null);

  if (q) {
    const safeQ = q.replace(/[,()]/g, "");
    if (safeQ) {
      feedQuery = feedQuery.or(
        `author_name.ilike.%${safeQ}%,author_handle.ilike.%${safeQ}%,summary.ilike.%${safeQ}%,title.ilike.%${safeQ}%,text_content.ilike.%${safeQ}%`
      );
    }
  }

  if (tag) feedQuery = feedQuery.contains("tags", [tag]);
  if (read) feedQuery = feedQuery.not("read_at", "is", null);
  if (["article", "video", "image", "text"].includes(type)) {
    feedQuery = feedQuery.eq("kind", type);
  }
  if (DATE_RANGES[date]) {
    // eslint-disable-next-line react-hooks/purity -- server-side cutoff for the date filter
    const since = new Date(Date.now() - DATE_RANGES[date] * 86400000).toISOString();
    feedQuery = feedQuery.gte("saved_at", since);
  }
  if (/^\d{4}$/.test(year)) {
    feedQuery = feedQuery
      .gte("posted_at", `${year}-01-01T00:00:00.000Z`)
      .lt("posted_at", `${Number(year) + 1}-01-01T00:00:00.000Z`);
  }
  if (author) feedQuery = feedQuery.eq("author_handle", author);

  const sortField = sort === "posted" ? "posted_at" : "saved_at";
  const ascending = order === "asc";

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data: feedRows, count: feedCount } = await feedQuery
    .order(sortField, { ascending, nullsFirst: false })
    .range(from, to);

  const { count: totalCount } = await supabase
    .from("saved_posts")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null);

  const feed = (feedRows ?? []).map((p) =>
    mapSavedPostToReaderPost(p as SavedPostRow)
  );

  // Smart sections, derived from unread posts.
  const { data: unreadRows } = await supabase
    .from("saved_posts")
    .select(COLS)
    .is("archived_at", null)
    .is("read_at", null)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(200);

  const unread = (unreadRows ?? []).map((p) =>
    mapSavedPostToReaderPost(p as SavedPostRow)
  );

  const quickPass = unread.filter((p) => p.readMinutes <= 1);
  const videos = unread.filter((p) => p.kind === "video");
  const toTry = unread.filter(isActionable);

  const sections: SmartSection[] = [
    {
      id: "quick-pass",
      title: "Quick pass",
      blurb: "A fast run through the newest — nothing here takes more than a minute.",
      actionLabel: "Start",
      posts: quickPass.slice(0, 5),
    },
    {
      id: "videos",
      title: "Videos you set aside",
      blurb:
        videos.length > 0
          ? `You saved ${videos.length} video${videos.length === 1 ? "" : "s"} and haven't opened them.`
          : "No unwatched videos right now.",
      actionLabel: "Watch",
      posts: videos.slice(0, 5),
    },
    {
      id: "to-try",
      title: "Things you meant to try",
      blurb:
        toTry.length > 0
          ? `${toTry.length} save${toTry.length === 1 ? "" : "s"} look like something to act on, not just read.`
          : "Nothing marked as actionable yet.",
      actionLabel: "Start",
      posts: toTry.slice(0, 5),
    },
  ];

  // Distinct values for the filter dropdowns.
  const [{ data: authorRows }, { data: labelRows }, { data: postedRows }] =
    await Promise.all([
      supabase.from("saved_posts").select("author_handle").is("archived_at", null),
      supabase.from("saved_posts").select("tags").is("archived_at", null),
      supabase
        .from("saved_posts")
        .select("posted_at")
        .is("archived_at", null)
        .not("posted_at", "is", null),
    ]);

  const authors = [
    ...new Set(
      (authorRows ?? []).map((r) => r.author_handle).filter((h): h is string => !!h)
    ),
  ].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const labels = [
    ...new Set((labelRows ?? []).flatMap((r) => r.tags ?? [])),
  ].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const years = [
    ...new Set(
      (postedRows ?? [])
        .map((r) => (r.posted_at ? new Date(r.posted_at).getUTCFullYear() : null))
        .filter((y): y is number => !!y)
    ),
  ]
    .sort((a, b) => b - a)
    .map(String);

  const totalPages = Math.max(1, Math.ceil((feedCount ?? 0) / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <ExploreClient
        feed={feed}
        sections={sections}
        totalCount={totalCount ?? 0}
        feedCount={feedCount ?? 0}
        totalPages={totalPages}
        page={page}
        q={q}
        tag={tag}
        read={read}
        type={type}
        date={date}
        year={year}
        author={author}
        sort={sort}
        order={order}
        authors={authors}
        labels={labels}
        years={years}
      />
    </main>
  );
}
