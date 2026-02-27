"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { X, Check, Loader2, LinkIcon } from "lucide-react";

type Status = "idle" | "saving" | "saved" | "error" | "no-token";

function SaveContent() {
  const searchParams = useSearchParams();
  const prefillUrl = searchParams.get("url") ?? "";
  const token = searchParams.get("token") ?? "";

  const [url, setUrl] = useState(prefillUrl);
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [status, setStatus] = useState<Status>(token ? "idle" : "no-token");
  const [errorMsg, setErrorMsg] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch existing tags on mount
  useEffect(() => {
    if (!token) return;
    fetch("/api/tags", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setExistingTags(data.tags ?? []);
      })
      .catch(() => {});
  }, [token]);

  // Auto-focus URL input if empty, tag input if URL is prefilled
  useEffect(() => {
    if (prefillUrl) {
      tagInputRef.current?.focus();
    } else {
      urlInputRef.current?.focus();
    }
  }, [prefillUrl]);

  // Filter suggestions
  const query = newTag.trim().toLowerCase();
  const suggestions = query
    ? existingTags.filter(
        (t) => t.includes(query) && !selectedTags.includes(t)
      )
    : [];

  const addTag = useCallback(
    (tag: string) => {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) return;
      if (!selectedTags.includes(normalized)) {
        setSelectedTags((prev) => [...prev, normalized]);
      }
      if (!existingTags.includes(normalized)) {
        setExistingTags((prev) => [...prev, normalized]);
      }
      setNewTag("");
      setShowDropdown(false);
      setHighlightedIndex(-1);
      tagInputRef.current?.focus();
    },
    [selectedTags, existingTags]
  );

  const removeTag = (tag: string) => {
    setSelectedTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        addTag(suggestions[highlightedIndex]);
      } else if (query) {
        addTag(query);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    } else if (
      e.key === "Backspace" &&
      !newTag &&
      selectedTags.length > 0
    ) {
      removeTag(selectedTags[selectedTags.length - 1]);
    }
  };

  const isValidUrl =
    url.trim().length > 0 &&
    /^https?:\/\/(x\.com|twitter\.com)\/\w+\/status\/\d+/i.test(url.trim());

  const handleSave = async () => {
    if (!isValidUrl || !token) return;
    setStatus("saving");
    setErrorMsg("");
    try {
      const res = await fetch("/api/x/save-post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: url.trim(), tags: selectedTags }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        setErrorMsg(`Server error (${res.status})`);
        setStatus("error");
        return;
      }
      if (!res.ok) {
        setErrorMsg(data.error ?? "Failed to save");
        setStatus("error");
        return;
      }
      setStatus("saved");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
      setStatus("error");
    }
  };

  if (status === "no-token") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-muted-foreground">
          Missing authentication token. Use the link from your Settings page.
        </p>
      </div>
    );
  }

  // Saved confirmation
  if (status === "saved") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="rounded-full bg-primary/10 p-4 mb-4">
          <Check className="h-6 w-6 text-primary" />
        </div>
        <p className="font-semibold mb-1">Saved!</p>
        <p className="text-sm text-muted-foreground mb-6">
          Post added to your library.
        </p>
        <button
          onClick={() => {
            setUrl("");
            setSelectedTags([]);
            setStatus("idle");
            setErrorMsg("");
          }}
          className="text-sm font-medium px-4 py-2 rounded-md border hover:bg-accent transition-colors"
        >
          Save another
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* URL input */}
      <div className="mb-5">
        <label
          htmlFor="tweet-url"
          className="block text-sm font-medium mb-2"
        >
          Post URL
        </label>
        <div className="relative">
          <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            ref={urlInputRef}
            id="tweet-url"
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (status === "error") setStatus("idle");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isValidUrl) {
                e.preventDefault();
                tagInputRef.current?.focus();
              }
            }}
            placeholder="https://x.com/user/status/123..."
            className="w-full text-sm pl-9 pr-3 py-2.5 rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {url.trim() && !isValidUrl && (
          <p className="text-xs text-muted-foreground mt-1.5">
            Paste a link to an X (Twitter) post
          </p>
        )}
      </div>

      {/* Tags */}
      <div className="mb-5">
        <label className="block text-sm font-medium mb-2">
          Tags{" "}
          <span className="text-muted-foreground font-normal">
            (optional)
          </span>
        </label>

        {/* Selected tags */}
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary text-primary-foreground"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="hover:opacity-70"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Tag input with typeahead */}
        <div className="relative">
          <input
            ref={tagInputRef}
            type="text"
            value={newTag}
            onChange={(e) => {
              setNewTag(e.target.value);
              setShowDropdown(true);
              setHighlightedIndex(-1);
            }}
            onKeyDown={handleTagKeyDown}
            onFocus={() => query && setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="Add tag..."
            className="w-full text-sm px-3 py-2.5 rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {showDropdown && suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-lg overflow-hidden z-50"
            >
              {suggestions.slice(0, 6).map((tag, i) => (
                <button
                  key={tag}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(tag)}
                  className={`w-full text-left text-sm px-3 py-2 transition-colors ${
                    i === highlightedIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {showDropdown &&
            query &&
            !existingTags.includes(query) &&
            suggestions.length === 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-lg overflow-hidden z-50">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(query)}
                  className="w-full text-left text-sm px-3 py-2 hover:bg-accent/50 text-muted-foreground"
                >
                  Create &ldquo;{query}&rdquo;
                </button>
              </div>
            )}
        </div>
      </div>

      {/* Error */}
      {status === "error" && (
        <p className="text-sm text-destructive mb-4">{errorMsg}</p>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={!isValidUrl || status === "saving"}
        className="w-full text-sm font-medium py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
      >
        {status === "saving" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Post"
        )}
      </button>
    </div>
  );
}

export default function SavePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-tight mb-2">
        Save a Post
      </h1>
      <p className="text-muted-foreground mb-8">
        Paste an X post URL to save it to your library.
      </p>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <SaveContent />
      </Suspense>
    </main>
  );
}
