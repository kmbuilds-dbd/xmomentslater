"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { SmartSections } from "@/components/SmartSections";
import { ExplorePostCard } from "@/components/ExplorePostCard";
import { ReaderDrawer } from "@/components/ReaderDrawer";
import type { ReaderPost, SmartSection } from "@/lib/reader";

interface ExploreClientProps {
  feed: ReaderPost[];
  sections: SmartSection[];
  totalCount: number;
  feedCount: number;
  totalPages: number;
  page: number;
  q: string;
}

export function ExploreClient({
  feed,
  sections,
  totalCount,
  feedCount,
  totalPages,
  page,
  q,
}: ExploreClientProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReaderPost | null>(null);
  const [query, setQuery] = useState(q);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/dashboard/reader?q=${encodeURIComponent(trimmed)}` : "/dashboard/reader");
  };

  const clearSearch = () => {
    setQuery("");
    router.push("/dashboard/reader");
  };

  const goTo = (pageNum: number) => {
    router.push(`/dashboard/reader?page=${pageNum}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Explore</h1>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
          {totalCount}
        </span>
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
        {q && (
          <p className="text-sm text-muted-foreground">
            {feedCount} result{feedCount === 1 ? "" : "s"} for “{q}”
          </p>
        )}
        {feed.length > 0 ? (
          feed.map((p) => <ExplorePostCard key={p.id} post={p} onOpen={setSelected} />)
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
            <button
              onClick={() => goTo(page - 1)}
              disabled={page <= 1}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              Prev
            </button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => goTo(page + 1)}
              disabled={page >= totalPages}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </section>

      <ReaderDrawer post={selected} onClose={() => setSelected(null)} />
    </>
  );
}
