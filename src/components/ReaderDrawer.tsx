"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Maximize2, Sparkles } from "lucide-react";
import { ReaderBody } from "@/components/ReaderBody";
import { AskAIPanel } from "@/components/AskAIPanel";
import type { ReaderPost } from "@/lib/reader";

interface ReaderDrawerProps {
  post: ReaderPost | null;
  onClose: () => void;
}

export function ReaderDrawer({ post, onClose }: ReaderDrawerProps) {
  const [askOpen, setAskOpen] = useState(false);
  const [prevPostId, setPrevPostId] = useState<string | null>(post?.id ?? null);

  // Reset the chat when switching posts (state adjustment during render).
  if (post?.id !== prevPostId) {
    setPrevPostId(post?.id ?? null);
    setAskOpen(false);
  }

  // Auto-mark read when a post is opened in the drawer.
  useEffect(() => {
    if (!post || post.readAt) return;
    fetch("/api/posts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id, action: "read" }),
    }).catch(() => {});
  }, [post]);

  if (!post) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col rounded-l-2xl border-l border-border bg-background shadow-2xl ${
        askOpen ? "max-w-[1100px]" : "max-w-[640px]"
      }`}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 pt-4">
        <button
          onClick={onClose}
          className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-secondary"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setAskOpen((v) => !v)}
            className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-secondary"
            aria-label="Ask AI"
            title="Ask AI"
          >
            <Sparkles className="h-5 w-5" />
          </button>
          <a
            href={post.xPostUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-secondary"
            aria-label="Open on X"
          >
            <X className="h-5 w-5" />
          </a>
          <Link
            href={`/dashboard/reader/${post.id}`}
            className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-secondary"
            aria-label="Expand to full page"
          >
            <Maximize2 className="h-5 w-5" />
          </Link>
        </div>
      </div>

      {askOpen ? (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto border-r border-border px-7 py-2">
            <ReaderBody post={post} />
          </div>
          <div className="flex min-w-0 w-[45%] flex-col">
            <AskAIPanel post={post} onClose={() => setAskOpen(false)} />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-7 pb-12 pt-2">
          <ReaderBody post={post} />
        </div>
      )}
    </div>
  );
}
