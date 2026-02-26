"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Clock, RefreshCw } from "lucide-react";
import Link from "next/link";

interface ParsedContent {
  author: string;
  handle: string;
  profileImageUrl?: string;
  date: string;
  blocks: Array<{ type: "text" | "image"; content: string }>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ReaderContentProps {
  postId: string;
  authorName: string | null;
  authorHandle: string | null;
  postedAt: string | null;
  savedAt: string;
  tags: string[];
  xPostUrl: string;
  parsedContent: ParsedContent | null;
  rawApiResponse?: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function estimateReadTime(blocks: ParsedContent["blocks"]): number {
  const wordCount = blocks
    .filter((b) => b.type === "text")
    .reduce((sum, b) => sum + b.content.split(/\s+/).length, 0);
  return Math.max(1, Math.ceil(wordCount / 200));
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Extract content blocks from raw X API response as fallback
 * when parsed_content.blocks is empty.
 * Checks for nested _article response (X Articles fetched during save).
 */
function extractBlocksFromRaw(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any
): ParsedContent["blocks"] {
  if (!raw?.data) return [];

  // If an article sub-response exists, prefer its content
  const source = raw._article?.data ? raw._article : raw;
  const blocks: ParsedContent["blocks"] = [];

  // Prefer note_tweet.text (long posts / X Notes), fall back to data.text
  const text = source.data.note_tweet?.text ?? source.data.text;
  if (text?.trim()) {
    blocks.push({ type: "text", content: text.trim() });
  }

  // Extract images from media includes
  const media = source.includes?.media ?? raw.includes?.media;
  if (media) {
    for (const m of media) {
      if (m.type === "photo" && m.url) {
        blocks.push({ type: "image", content: m.url });
      }
    }
  }

  return blocks;
}

/** Check if content blocks are just a URL (no real text) */
function isContentJustUrl(blocks: ParsedContent["blocks"]): boolean {
  const textBlocks = blocks.filter((b) => b.type === "text");
  if (textBlocks.length !== 1) return false;
  const text = textBlocks[0].content.trim();
  return /^https?:\/\/\S+$/.test(text);
}

export function ReaderContent({
  postId,
  authorName,
  authorHandle,
  postedAt,
  tags,
  xPostUrl,
  parsedContent,
  rawApiResponse,
}: ReaderContentProps) {
  const router = useRouter();
  const [scrollProgress, setScrollProgress] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        setScrollProgress(Math.min(100, (scrollTop / docHeight) * 100));
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Use parsed blocks, falling back to raw API response extraction
  const parsedBlocks = parsedContent?.blocks ?? [];
  const blocks =
    parsedBlocks.length > 0
      ? parsedBlocks
      : extractBlocksFromRaw(rawApiResponse);
  const readTime = estimateReadTime(blocks);
  const displayName = authorName || authorHandle || "Unknown";
  const needsRefresh = blocks.length === 0 || isContentJustUrl(blocks);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: postId }),
      });
      const data = await res.json();
      if (res.ok) {
        // Check if the refreshed content is still just a URL
        const newBlocks = data.parsed?.blocks ?? [];
        const stillJustUrl =
          newBlocks.length === 0 || isContentJustUrl(newBlocks);
        if (stillJustUrl) {
          setRefreshError(
            "This X Article's content isn't available via the API. Use the Original link to read it on X."
          );
        } else {
          router.refresh();
        }
      } else {
        setRefreshError(data.error || "Failed to refresh content");
      }
    } catch {
      setRefreshError("Network error — check your connection");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      {/* Scroll progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-transparent">
        <div
          className="h-full bg-primary transition-[width] duration-150"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      <div className="mx-auto max-w-[65ch] px-6 py-12">
        {/* Back button */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Library
        </Link>

        {/* Author header */}
        <header className="mb-8 pb-6 border-b">
          <h1 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold tracking-tight mb-2">
            {displayName}
          </h1>
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {authorHandle && <span>@{authorHandle}</span>}
            {postedAt && (
              <>
                <span aria-hidden>&middot;</span>
                <span>{formatDate(postedAt)}</span>
              </>
            )}
            <span aria-hidden>&middot;</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {readTime} min read
            </span>
            <a
              href={xPostUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Original
            </a>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
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
        </header>

        {/* Content blocks */}
        <article className="font-[family-name:var(--font-newsreader)] text-lg leading-relaxed space-y-6">
          {needsRefresh && (
            <div className="rounded-lg border border-dashed py-8 px-6 text-center font-sans">
              {refreshError ? (
                <>
                  <p className="text-muted-foreground mb-4 text-sm">
                    {refreshError}
                  </p>
                  <a
                    href={xPostUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Read on X
                  </a>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground mb-3 text-sm">
                    This post links to an X Article. Click refresh to fetch the full content.
                  </p>
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Fetching…" : "Refresh content"}
                  </button>
                </>
              )}
            </div>
          )}
          {blocks.map((block, i) => {
            if (block.type === "text") {
              return (
                <p key={i} className="whitespace-pre-wrap">
                  {block.content}
                </p>
              );
            }
            if (block.type === "image") {
              return (
                <figure key={i} className="my-8">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={block.content}
                    alt="Post image"
                    className="w-full rounded-lg"
                    loading="lazy"
                  />
                </figure>
              );
            }
            return null;
          })}
        </article>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to library
          </Link>
        </footer>
      </div>
    </>
  );
}
