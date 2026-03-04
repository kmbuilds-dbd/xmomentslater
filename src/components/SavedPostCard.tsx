"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Trash2, ExternalLink, Bookmark } from "lucide-react";

interface SavedPostCardProps {
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
  source?: string;
}

export function SavedPostCard({
  id,
  authorName,
  authorHandle,
  postedAt,
  savedAt,
  readAt,
  tags,
  xPostUrl,
  title,
  preview,
  source,
}: SavedPostCardProps) {
  const [isRead, setIsRead] = useState(!!readAt);
  const [deleted, setDeleted] = useState(false);
  const [acting, setActing] = useState(false);

  const handleMarkRead = async () => {
    setActing(true);
    const res = await fetch("/api/posts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: isRead ? "unread" : "read" }),
    });
    if (res.ok) setIsRead(!isRead);
    setActing(false);
  };

  const handleDelete = async () => {
    setActing(true);
    const res = await fetch("/api/posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setDeleted(true);
    setActing(false);
  };

  if (deleted) return null;

  const timeAgo = formatTimeAgo(savedAt);
  const displayName = authorName || authorHandle || "Unknown";

  return (
    <div
      className={`rounded-lg border px-5 py-4 transition-colors ${
        isRead ? "opacity-60" : ""
      }`}
    >
      <Link href={`/dashboard/reader/${id}`} className="block group">
        {/* Author + time */}
        <div className="flex items-center gap-2 mb-1.5">
          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
            {displayName}
          </p>
          {authorHandle && (
            <span className="text-xs text-muted-foreground">@{authorHandle}</span>
          )}
          <span className="flex items-center gap-1.5 ml-auto shrink-0">
            {source === "bookmark" && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Bookmark className="h-2.5 w-2.5" />
                Bookmarked
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {timeAgo}
            </span>
          </span>
        </div>

        {/* Article title */}
        {title && (
          <p className="text-sm font-medium mb-1 group-hover:text-primary transition-colors">
            {title}
          </p>
        )}

        {/* Content preview / summary */}
        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
          {preview}
        </p>
      </Link>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleMarkRead}
          disabled={acting}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <BookOpen className="h-3 w-3" />
          {isRead ? "Unread" : "Read"}
        </button>
        <a
          href={xPostUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-secondary transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Original
        </a>
        <button
          onClick={handleDelete}
          disabled={acting}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded-md hover:bg-secondary transition-colors disabled:opacity-50 ml-auto"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
