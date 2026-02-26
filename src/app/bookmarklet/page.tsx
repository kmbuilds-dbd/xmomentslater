"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { X, Check, Loader2 } from "lucide-react";

type Status = "idle" | "loading" | "saving" | "saved" | "error";

function BookmarkletContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url") ?? "";

  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch existing tags on mount
  useEffect(() => {
    fetch("/api/tags")
      .then((res) => {
        if (res.status === 401) {
          setErrorMsg("Please log in to xMomentsLater first.");
          setStatus("error");
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setExistingTags(data.tags ?? []);
          setStatus("idle");
        }
      })
      .catch(() => setStatus("idle"));
  }, []);

  // Filter suggestions: match input, exclude already-selected
  const query = newTag.trim().toLowerCase();
  const suggestions = query
    ? existingTags.filter(
        (t) => t.includes(query) && !selectedTags.includes(t)
      )
    : [];

  const addTag = (tag: string) => {
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
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    setSelectedTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewTag(e.target.value);
    setShowDropdown(true);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    } else if (e.key === "Backspace" && !newTag && selectedTags.length > 0) {
      removeTag(selectedTags[selectedTags.length - 1]);
    }
  };

  const handleSave = async () => {
    setStatus("saving");
    try {
      const res = await fetch("/api/x/save-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, tags: selectedTags }),
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
      // Try to close immediately, then retry
      setTimeout(() => tryClose(), 800);
      setTimeout(() => tryClose(), 2000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
      setStatus("error");
    }
  };

  const tryClose = () => {
    // Tell the parent (x.com) to close this popup via the stored handle
    try {
      window.opener?.postMessage("xml-close", "*");
    } catch {
      // opener not available
    }
    // Also try closing directly
    try {
      window.close();
    } catch {
      // Browser blocked close
    }
    try {
      self.close();
    } catch {
      // fallback handled by UI
    }
  };

  const handleClose = () => {
    tryClose();
  };

  // Saved confirmation
  if (status === "saved") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-4">
        <div className="rounded-full bg-primary/10 p-3 mb-3">
          <Check className="h-6 w-6 text-primary" />
        </div>
        <p className="font-semibold text-sm mb-3">Saved!</p>
        <button
          onClick={tryClose}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Close this window
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground p-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold truncate flex-1 mr-2">Save to xMomentsLater</p>
        <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* URL preview */}
      <p className="text-xs text-muted-foreground truncate mb-3">{url}</p>

      {status === "loading" ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Selected tags as removable chips */}
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground"
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

          {/* Tag input with typeahead dropdown */}
          <div className="relative mb-3">
            <input
              ref={inputRef}
              type="text"
              value={newTag}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => query && setShowDropdown(true)}
              onBlur={() => {
                // Delay to allow click on dropdown item
                setTimeout(() => setShowDropdown(false), 150);
              }}
              placeholder="Add tag..."
              className="w-full text-xs px-3 py-2 rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />

            {/* Dropdown */}
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
                    className={`w-full text-left text-xs px-3 py-1.5 transition-colors ${
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

            {/* "Create new" hint when typing something not in existing */}
            {showDropdown && query && !existingTags.includes(query) && suggestions.length === 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-lg overflow-hidden z-50">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(query)}
                  className="w-full text-left text-xs px-3 py-1.5 hover:bg-accent/50 text-muted-foreground"
                >
                  Create &ldquo;{query}&rdquo;
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Error */}
      {status === "error" && (
        <p className="text-xs text-destructive mb-2">{errorMsg}</p>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={status === "saving" || status === "loading"}
        className="mt-auto w-full text-sm font-medium py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {status === "saving" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving...
          </>
        ) : (
          "Save"
        )}
      </button>
    </div>
  );
}

export default function BookmarkletPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-4 w-4 animate-spin" /></div>}>
      <BookmarkletContent />
    </Suspense>
  );
}
