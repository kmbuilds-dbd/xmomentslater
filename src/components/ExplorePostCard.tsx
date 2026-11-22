"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Trash2, ExternalLink, Play, FileText } from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";
import type { ReaderPost } from "@/lib/reader";

interface ExplorePostCardProps {
  post: ReaderPost;
  /** When true (Archive view), the primary action is "unarchive" instead of archive. */
  archived?: boolean;
  /** Opens the post in the reading drawer. */
  onOpen: (post: ReaderPost) => void;
}

export function ExplorePostCard({ post, archived = false, onOpen }: ExplorePostCardProps) {
  const [hidden, setHidden] = useState(false);
  const [acting, setActing] = useState(false);

  if (hidden) return null;

  const displayName = post.authorName || post.authorHandle || "Unknown";
  const timeLabel = post.postedAt ? formatTimeAgo(post.postedAt) : formatTimeAgo(post.savedAt);
  const isRead = !!post.readAt;

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActing(true);
    const res = await fetch("/api/posts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id, action: archived ? "unarchive" : "archive" }),
    });
    if (res.ok) setHidden(true);
    setActing(false);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActing(true);
    const res = await fetch("/api/posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id }),
    });
    if (res.ok) setHidden(true);
    setActing(false);
  };

  const kindLabel =
    post.kind === "article" ? "Article" : post.kind === "video" ? "Video" : post.kind === "image" ? "Image" : null;

  return (
    <div
      onClick={() => onOpen(post)}
      className={`cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/20 ${isRead ? "opacity-70" : ""}`}
    >
      {/* Author */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-semibold">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {post.authorHandle ? `@${post.authorHandle} · ` : ""}
            {timeLabel}
          </p>
        </div>
        <span className="ml-auto flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleArchive}
            disabled={acting}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50"
            aria-label={archived ? "Unarchive" : "Archive"}
            title={archived ? "Unarchive" : "Archive"}
          >
            {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </button>
          <button
            onClick={handleDelete}
            disabled={acting}
            className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-secondary disabled:opacity-50"
            aria-label="Delete"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <a
            href={post.xPostUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary"
            aria-label="Open on X"
            title="Open on X"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </span>
      </div>

      {/* Body */}
      <div className="mt-3">
        {post.title && <p className="text-sm font-semibold leading-snug">{post.title}</p>}
        <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{post.preview}</p>

        {post.mediaUrls.length > 0 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.mediaUrls[0]}
            alt=""
            className="mt-2 w-full rounded-lg border border-border object-cover max-h-64"
            loading="lazy"
          />
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {kindLabel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
            {kindLabel}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">{post.readMinutes} min</span>
        <button
          onClick={() => onOpen(post)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary transition-colors"
        >
          {post.kind === "video" ? <Play className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
          {post.kind === "video" ? "Watch" : "Read"}
        </button>
      </div>
    </div>
  );
}
