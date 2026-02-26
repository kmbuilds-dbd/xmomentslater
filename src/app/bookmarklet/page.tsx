"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { X, Check, Plus, Loader2 } from "lucide-react";

type Status = "idle" | "loading" | "saving" | "saved" | "error";

function BookmarkletContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url") ?? "";

  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");

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

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const addNewTag = () => {
    const tag = newTag.trim().toLowerCase();
    if (!tag) return;
    if (!selectedTags.includes(tag)) {
      setSelectedTags((prev) => [...prev, tag]);
    }
    if (!existingTags.includes(tag)) {
      setExistingTags((prev) => [...prev, tag]);
    }
    setNewTag("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addNewTag();
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
      // Auto-dismiss after 1.5s
      setTimeout(() => {
        window.close();
      }, 1500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
      setStatus("error");
    }
  };

  const handleClose = () => {
    window.close();
  };

  // Saved confirmation
  if (status === "saved") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-4">
        <div className="rounded-full bg-primary/10 p-3 mb-3">
          <Check className="h-6 w-6 text-primary" />
        </div>
        <p className="font-semibold text-sm">Saved!</p>
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

      {/* Tag chips */}
      {status === "loading" ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3 max-h-24 overflow-y-auto">
            {existingTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  selectedTags.includes(tag)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-secondary-foreground border-border hover:border-primary/50"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* New tag input */}
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add tag..."
              className="flex-1 text-xs px-3 py-1.5 rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={addNewTag}
              disabled={!newTag.trim()}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <Plus className="h-4 w-4" />
            </button>
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
