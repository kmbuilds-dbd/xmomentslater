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
  "id, author_name, author_handle, posted_at, saved_at, read_at, tags, x_post_url, parsed_content, raw_api_response, summary, title, source, category";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ReaderPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(
    1,
    parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1
  );

  // Feed: non-archived posts, optional keyword search, newest posted first.
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

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data: feedRows, count: feedCount } = await feedQuery
    .order("posted_at", { ascending: false, nullsFirst: false })
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
      />
    </main>
  );
}
