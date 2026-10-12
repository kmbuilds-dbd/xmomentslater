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
  title: string | null;
  preview: string;
  source: string;
  category: string | null;
}

type SearchMode = "keyword" | "semantic";

interface SemanticSearchResponse {
  posts?: Post[];
  unavailable?: boolean;
  error?: string;
}

interface LibraryViewProps {
  posts: Post[];
  /** Top tags by usage, surfaced as chips. */
  topTags: string[];
  /** Every distinct tag, alphabetical — backs the "more tags" search. */
  allTags: string[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  currentSearch: string;
  currentTag: string;
  currentSort: string;
  currentSource: string;
  currentShowRead: boolean;
  hasXConnection: boolean;
}

export function LibraryView({
  posts,
  topTags,
  allTags,
  totalCount,
  totalPages,
  currentPage,
  currentSearch,
  currentTag,
  currentSort,
  currentSource,
  currentShowRead,
  hasXConnection,
}: LibraryViewProps) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(currentSearch);
  const [searchMode, setSearchMode] = useState<SearchMode>("keyword");
  const [semanticPosts, setSemanticPosts] = useState<Post[]>(posts);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState("");
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [tagHighlightIndex, setTagHighlightIndex] = useState(-1);

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
        source: currentSource,
        showRead: String(currentShowRead),
        page: String(currentPage),
      };

      // Apply updates
      Object.assign(current, updates);

      // Build params, skipping defaults/empty values to keep URL clean
      if (current.q) params.set("q", current.q);
      if (current.tag) params.set("tag", current.tag);
      if (current.sort && current.sort !== "posted_desc")
        params.set("sort", current.sort);
      if (current.source) params.set("source", current.source);
      if (current.showRead === "true") params.set("showRead", "true");
      if (current.page && current.page !== "1")
        params.set("page", current.page);

      const qs = params.toString();
      router.push(`/dashboard${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, currentSearch, currentTag, currentSort, currentSource, currentShowRead, currentPage]
  );

  // Debounced search — fires 300ms after user stops typing
  useEffect(() => {
    if (searchMode !== "keyword") return;

    const timer = setTimeout(() => {
      if (searchInput !== currentSearch) {
        updateParams({ q: searchInput, page: "1" });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, currentSearch, searchMode, updateParams]);

  useEffect(() => {
    if (searchMode !== "semantic" || !searchInput.trim()) {
      setSemanticPosts(posts);
      setSemanticError(null);
      setSemanticLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSemanticLoading(true);
      setSemanticError(null);

      try {
        const params = new URLSearchParams({
          q: searchInput.trim(),
          showRead: String(currentShowRead),
        });
        if (currentTag) params.set("tag", currentTag);
        if (currentSource) params.set("source", currentSource);

        const response = await fetch(`/api/search/semantic?${params}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as SemanticSearchResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "Search failed");
        }

        if (data.unavailable) {
          setSemanticError("Semantic search is not configured.");
          setSemanticPosts([]);
        } else {
          setSemanticPosts(data.posts ?? []);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setSemanticError(err instanceof Error ? err.message : "Search failed");
        }
      } finally {
        if (!controller.signal.aborted) {
          setSemanticLoading(false);
        }
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    currentShowRead,
    currentSource,
    currentTag,
    posts,
    searchInput,
    searchMode,
  ]);

  const handleTagClick = (tag: string) => {
    updateParams({ tag: tag === currentTag ? "" : tag, page: "1" });
  };

  // Always keep the active filter visible even if it's outside the top N —
  // otherwise picking a rare tag from search would make it vanish from view.
  const surfacedTags =
    currentTag && !topTags.includes(currentTag) ? [currentTag, ...topTags] : topTags;

  const tagSearchQuery = tagQuery.trim().toLowerCase();
  const tagSuggestions = tagSearchQuery
    ? allTags.filter((t) => t !== currentTag && t.includes(tagSearchQuery))
    : [];

  const selectTag = (tag: string) => {
    handleTagClick(tag);
    setTagQuery("");
    setShowTagDropdown(false);
    setTagHighlightIndex(-1);
  };

  const handleTagSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setTagHighlightIndex((prev) => (prev < tagSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setTagHighlightIndex((prev) => (prev > 0 ? prev - 1 : tagSuggestions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = tagHighlightIndex >= 0 ? tagSuggestions[tagHighlightIndex] : tagSuggestions[0];
      if (pick) selectTag(pick);
    } else if (e.key === "Escape") {
      setShowTagDropdown(false);
    }
  };

  const handleSourceChange = (source: string) => {
    updateParams({ source: source === currentSource ? "" : source, page: "1" });
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

  const semanticQueryActive = searchMode === "semantic" && !!searchInput.trim();
  const visiblePosts = semanticQueryActive ? semanticPosts : posts;
  const visibleTotalCount = semanticQueryActive ? semanticPosts.length : totalCount;
  const hasFilters =
    (searchMode === "semantic" ? searchInput : currentSearch) ||
    currentTag ||
    currentSort !== "posted_desc" ||
    currentSource ||
    currentShowRead;

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
            placeholder="Search posts..."
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
        <div className="flex shrink-0 rounded-md border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => {
              setSearchMode("keyword");
              setSemanticError(null);
            }}
            className={`min-w-16 rounded px-2 py-1 transition-colors ${
              searchMode === "keyword"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Keyword
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchMode("semantic");
              setSemanticError(null);
            }}
            className={`min-w-16 rounded px-2 py-1 transition-colors ${
              searchMode === "semantic"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Semantic
          </button>
        </div>
        <select
          value={currentSort}
          onChange={(e) => handleSortChange(e.target.value)}
          className="text-sm py-2 px-3 rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="posted_desc">Newest posted</option>
          <option value="saved_desc">Newest saved</option>
          <option value="unread">Unread first</option>
        </select>
      </div>

      {/* Source filter + Show read toggle */}
      <div className="flex items-center gap-1.5 mb-4">
        {[
          { value: "", label: "All" },
          { value: "manual", label: "Saved" },
          { value: "bookmark", label: "Bookmarked" },
          { value: "ifttt", label: "Liked via IFTTT" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleSourceChange(opt.value)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              (opt.value === "" ? !currentSource : currentSource === opt.value)
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-foreground hover:bg-secondary"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={currentShowRead}
            onChange={(e) =>
              updateParams({ showRead: String(e.target.checked), page: "1" })
            }
            className="rounded border-muted-foreground/50"
          />
          Show read
        </label>
      </div>

      {/* Tag filters — most-used tags surfaced as chips, the rest searchable */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {surfacedTags.map((tag) => (
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
          {allTags.length > topTags.length && (
            <div className="relative">
              <input
                type="text"
                value={tagQuery}
                onChange={(e) => {
                  setTagQuery(e.target.value);
                  setShowTagDropdown(true);
                  setTagHighlightIndex(-1);
                }}
                onKeyDown={handleTagSearchKeyDown}
                onFocus={() => tagQuery && setShowTagDropdown(true)}
                onBlur={() => setTimeout(() => setShowTagDropdown(false), 150)}
                placeholder="More tags..."
                className="text-xs px-2.5 py-1 w-24 focus:w-36 rounded-full border bg-background focus:outline-none focus:ring-1 focus:ring-ring transition-all"
              />
              {showTagDropdown && tagSuggestions.length > 0 && (
                <div className="absolute left-0 top-full mt-1 min-w-[9rem] bg-popover border rounded-md shadow-lg overflow-hidden z-50">
                  {tagSuggestions.slice(0, 8).map((tag, i) => (
                    <button
                      key={tag}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectTag(tag)}
                      className={`w-full text-left text-xs px-3 py-1.5 transition-colors ${
                        i === tagHighlightIndex
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {semanticLoading && semanticQueryActive && (
        <p className="mb-3 text-sm text-muted-foreground">Searching semantically...</p>
      )}
      {semanticError && semanticQueryActive && (
        <p className="mb-3 text-sm text-destructive">{semanticError}</p>
      )}
      {visiblePosts.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            {visibleTotalCount} post{visibleTotalCount !== 1 ? "s" : ""}
            {hasFilters ? " found" : ""}
          </p>
          {visiblePosts.map((post) => (
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
              title={post.title}
              preview={post.preview}
              source={post.source}
              category={post.category}
            />
          ))}

          {/* Pagination */}
          {!semanticQueryActive && totalPages > 1 && (
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
                  ? "Set up IFTTT in Settings to save liked posts, or use the bookmarklet."
                  : "Set up IFTTT in Settings to save posts you like on X."}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
