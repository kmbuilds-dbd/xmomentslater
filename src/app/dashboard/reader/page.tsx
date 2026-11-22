import { redirect } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SmartSections } from "@/components/SmartSections";
import { ExplorePostCard } from "@/components/ExplorePostCard";
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
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Explore</h1>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
          {totalCount ?? 0}
        </span>
        <form action="/dashboard/reader" className="ml-auto flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search…"
            className="w-40 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </form>
      </div>

      {/* Right Now */}
      <section className="mt-6">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Right now
        </p>
        <div className="mt-2">
          <SmartSections sections={sections} />
        </div>
      </section>

      {/* Feed */}
      <section className="mt-8 space-y-3">
        {q && (
          <p className="text-sm text-muted-foreground">
            {feedCount ?? 0} result{(feedCount ?? 0) === 1 ? "" : "s"} for “{q}”
          </p>
        )}
        {feed.length > 0 ? (
          feed.map((p) => <ExplorePostCard key={p.id} post={p} />)
        ) : (
          <div className="rounded-xl border border-dashed px-8 py-16 text-center">
            <p className="text-lg text-muted-foreground">Nothing here yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Save posts from X and they&apos;ll show up here.
            </p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-4">
            {page > 1 ? (
              <Link
                href={`/dashboard/reader?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Prev
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground opacity-30">Prev</span>
            )}
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={`/dashboard/reader?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Next
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground opacity-30">Next</span>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
