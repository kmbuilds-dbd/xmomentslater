"use client";

import { useEffect, useState } from "react";
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

type SearchMode = "keyword" | "semantic";

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
  const [searchMode, setSearchMode] = useState<SearchMode>("keyword");
  const [semanticPosts, setSemanticPosts] = useState<ReaderPost[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState<string | null>(null);

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
    if (searchMode === "keyword") {
      navigate({ q: query.trim(), page: 1 });
    }
  };

  const clearSearch = () => {
    setQuery("");
    navigate({ q: "", page: 1 });
  };

  // Semantic search — debounced client-side fetch over the vector index.
  useEffect(() => {
    if (searchMode !== "semantic" || !query.trim()) {
      setSemanticPosts([]);
      setSemanticError(null);
      setSemanticLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSemanticLoading(true);
      setSemanticError(null);
      try {
        const params = new URLSearchParams({ q: query.trim() });
        if (tag) params.set("tag", tag);
        if (type) params.set("type", type);
        if (date) params.set("date", date);
        if (year) params.set("year", year);
        if (author) params.set("author", author);

        const res = await fetch(`/api/search/semantic?${params}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        if (data.unavailable) {
          setSemanticError("Semantic search is not configured.");
          setSemanticPosts([]);
        } else {
          setSemanticPosts(data.posts ?? []);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setSemanticError(
            err instanceof Error ? err.message : "Search failed"
          );
        }
      } finally {
        if (!controller.signal.aborted) setSemanticLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [searchMode, query, tag, type, date, year, author]);

  const semanticActive = searchMode === "semantic" && !!query.trim();
  const visiblePosts = semanticActive ? semanticPosts : feed;
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
        <form onSubmit={submitSearch} className="ml-auto flex items-center gap-2">
          <div className="flex shrink-0 rounded-md border border-border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setSearchMode("keyword")}
              className={`rounded px-2 py-0.5 transition-colors ${
                searchMode === "keyword"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Keyword
            </button>
            <button
              type="button"
              onClick={() => setSearchMode("semantic")}
              className={`rounded px-2 py-0.5 transition-colors ${
                searchMode === "semantic"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Semantic
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-40 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
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
        {semanticLoading && <p className="text-sm text-muted-foreground">Searching semantically…</p>}
        {semanticError && <p className="text-sm text-destructive">{semanticError}</p>}
        {!semanticLoading && !semanticError && hasFilter && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {semanticActive ? semanticPosts.length : feedCount} result
            {(semanticActive ? semanticPosts.length : feedCount) === 1 ? "" : "s"}
            <button
              onClick={() =>
                navigate({
                  q: "",
                  tag: "",
                  read: false,
                  type: "",
                  date: "",
                  year: "",
                  author: "",
                  page: 1,
                })
              }
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs hover:text-foreground"
            >
              Clear filters
              <X className="h-3 w-3" />
            </button>
          </p>
        )}
        {visiblePosts.length > 0 ? (
          visiblePosts.map((p) => (
            <ExplorePostCard key={p.id} post={p} onOpen={setSelected} />
          ))
        ) : (
          !semanticLoading && (
            <div className="rounded-xl border border-dashed px-8 py-16 text-center">
              <p className="text-lg text-muted-foreground">Nothing here yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {semanticActive
                  ? "No semantic matches."
                  : "No posts match these filters."}
              </p>
            </div>
          )
        )}

        {!semanticActive && totalPages > 1 && (
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
