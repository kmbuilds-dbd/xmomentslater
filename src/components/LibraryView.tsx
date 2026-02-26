"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { SavedPostCard } from "@/components/SavedPostCard";

interface Post {
  id: string;
  authorName: string | null;
  authorHandle: string | null;
  postedAt: string | null;
  savedAt: string;
  readAt: string | null;
  tags: string[];
  xPostUrl: string;
  preview: string;
}

interface LibraryViewProps {
  posts: Post[];
  allTags: string[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  currentSearch: string;
  currentTag: string;
  currentSort: string;
  hasXConnection: boolean;
}

export function LibraryView({
  posts,
  allTags,
  totalCount,
  totalPages,
  currentPage,
  currentSearch,
  currentTag,
  currentSort,
  hasXConnection,
}: LibraryViewProps) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(currentSearch);

  // Sync search input when props change (after navigation)
  useEffect(() => {
    setSearchInput(currentSearch);
  }, [currentSearch]);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams();

      // Start from current values
      const current: Record<string, string> = {
        q: currentSearch,
        tag: currentTag,
        sort: currentSort,
        page: String(currentPage),
      };

      // Apply updates
      Object.assign(current, updates);

      // Build params, skipping defaults/empty values to keep URL clean
      if (current.q) params.set("q", current.q);
      if (current.tag) params.set("tag", current.tag);
      if (current.sort && current.sort !== "saved_desc")
        params.set("sort", current.sort);
      if (current.page && current.page !== "1")
        params.set("page", current.page);

      const qs = params.toString();
      router.push(`/dashboard${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, currentSearch, currentTag, currentSort, currentPage]
  );

  // Debounced search — fires 300ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== currentSearch) {
        updateParams({ q: searchInput, page: "1" });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, currentSearch, updateParams]);

  const handleTagClick = (tag: string) => {
    updateParams({ tag: tag === currentTag ? "" : tag, page: "1" });
  };

  const handleSortChange = (sort: string) => {
    updateParams({ sort, page: "1" });
  };

  const handlePageChange = (page: number) => {
    updateParams({ page: page.toString() });
  };

  const clearSearch = () => {
    setSearchInput("");
    updateParams({ q: "", page: "1" });
  };

  const hasFilters =
    currentSearch || currentTag || currentSort !== "saved_desc";

  return (
    <>
      {/* Search + Sort bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by author..."
            className="w-full text-sm pl-9 pr-8 py-2 rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {searchInput && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={currentSort}
          onChange={(e) => handleSortChange(e.target.value)}
          className="text-sm py-2 px-3 rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="saved_desc">Newest saved</option>
          <option value="unread">Unread first</option>
        </select>
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => handleTagClick(tag)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                tag === currentTag
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {tag}
            </button>
          ))}
          {currentTag && (
            <button
              onClick={() => handleTagClick("")}
              className="text-xs px-2.5 py-1 rounded-full border text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {posts.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            {totalCount} post{totalCount !== 1 ? "s" : ""}
            {hasFilters ? " found" : ""}
          </p>
          {posts.map((post) => (
            <SavedPostCard
              key={post.id}
              id={post.id}
              authorName={post.authorName}
              authorHandle={post.authorHandle}
              postedAt={post.postedAt}
              savedAt={post.savedAt}
              readAt={post.readAt}
              tags={post.tags}
              xPostUrl={post.xPostUrl}
              preview={post.preview}
            />
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed py-16 px-8 text-center">
          {hasFilters ? (
            <>
              <p className="font-[family-name:var(--font-fraunces)] text-lg text-muted-foreground mb-2">
                No matching posts
              </p>
              <p className="text-sm text-muted-foreground">
                Try adjusting your search or filters.
              </p>
            </>
          ) : (
            <>
              <p className="font-[family-name:var(--font-fraunces)] text-lg text-muted-foreground mb-2">
                No saved posts yet
              </p>
              <p className="text-sm text-muted-foreground">
                {hasXConnection
                  ? "Use the bookmarklet to save posts from X."
                  : "Connect your X account in Settings to get started."}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
