"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { SmartSections } from "@/components/SmartSections";
import { ExplorePostCard } from "@/components/ExplorePostCard";
import { ReaderDrawer } from "@/components/ReaderDrawer";
import { FilterToolbar } from "@/components/FilterToolbar";
import { ImportBookmarksButton } from "@/components/ImportBookmarksButton";
import type { ReaderPost, SmartSection } from "@/lib/reader";

interface ExploreClientProps {
  feed: ReaderPost[];
  sections: SmartSection[];
  totalCount: number;
  feedCount: number;
  totalPages: number;
  page: number;
  q: string;
  tag: string;
  read: boolean;
  type: string;
  date: string;
  year: string;
  author: string;
  sort: string;
  order: string;
  authors: string[];
  labels: string[];
  years: string[];
  hasXConnection: boolean;
}

export function ExploreClient({
  feed,
  sections,
  totalCount,
  feedCount,
  totalPages,
  page,
  q,
  tag,
  read,
  type,
  date,
  year,
  author,
  sort,
  order,
  authors,
  labels,
  years,
  hasXConnection,
}: ExploreClientProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReaderPost | null>(null);
  const [query, setQuery] = useState(q);

  const navigate = (patch: Record<string, string | boolean | number>) => {
    const state = {
      q,
      tag,
      read,
      type,
      date,
      year,
      author,
      sort,
      order,
      page,
      ...patch,
    } as Record<string, string | boolean | number>;

    const p = new URLSearchParams();
    if (state.q) p.set("q", String(state.q));
    if (state.tag) p.set("tag", String(state.tag));
    if (state.read) p.set("read", "1");
    if (state.type) p.set("type", String(state.type));
    if (state.date) p.set("date", String(state.date));
    if (state.year) p.set("year", String(state.year));
    if (state.author) p.set("author", String(state.author));
    if (state.sort && state.sort !== "imported") p.set("sort", String(state.sort));
    if (state.order && state.order !== "desc") p.set("order", String(state.order));
    const pageNum = Number(state.page) || 1;
    if (pageNum > 1) p.set("page", String(pageNum));

    const s = p.toString();
    router.push(s ? `/dashboard/reader?${s}` : "/dashboard/reader");
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ q: query.trim(), page: 1 });
  };

  const clearSearch = () => {
    setQuery("");
    navigate({ q: "", page: 1 });
  };

  const hasFilter = !!(q || tag || read || type || date || year || author);

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Explore</h1>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
          {totalCount}
        </span>
        <ImportBookmarksButton hasXConnection={hasXConnection} />
        <form onSubmit={submitSearch} className="ml-auto flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-40 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button type="button" onClick={clearSearch} className="text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>

      {/* Filter / sort toolbar */}
      <div className="mt-4">
        <FilterToolbar
          type={type}
          date={date}
          year={year}
          author={author}
          tag={tag}
          sort={sort}
          order={order}
          authors={authors}
          labels={labels}
          years={years}
          onChange={(patch) => navigate({ ...patch, page: 1 })}
        />
      </div>

      {/* Right now */}
      <section className="mt-6">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Right now
        </p>
        <div className="mt-2">
          <SmartSections sections={sections} onOpen={setSelected} />
        </div>
      </section>

      {/* Feed */}
      <section className="mt-8 space-y-3">
        {hasFilter && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {feedCount} result{feedCount === 1 ? "" : "s"}
            <button
              onClick={() => navigate({ q: "", tag: "", read: false, type: "", date: "", year: "", author: "", page: 1 })}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs hover:text-foreground"
            >
              Clear filters
              <X className="h-3 w-3" />
            </button>
          </p>
        )}
        {feed.length > 0 ? (
          feed.map((p) => <ExplorePostCard key={p.id} post={p} onOpen={setSelected} />)
        ) : (
          <div className="rounded-xl border border-dashed px-8 py-16 text-center">
            <p className="text-lg text-muted-foreground">Nothing here yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No posts match these filters.
            </p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-4">
            <button
              onClick={() => navigate({ page: page - 1 })}
              disabled={page <= 1}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              Prev
            </button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => navigate({ page: page + 1 })}
              disabled={page >= totalPages}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </section>

      <ReaderDrawer key={selected?.id ?? "closed"} post={selected} onClose={() => setSelected(null)} />
    </>
  );
}
