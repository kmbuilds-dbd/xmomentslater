"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Clock } from "lucide-react";
import Link from "next/link";

interface ParsedContent {
  author: string;
  handle: string;
  profileImageUrl?: string;
  date: string;
  blocks: Array<{ type: "text" | "image"; content: string }>;
}

interface ReaderContentProps {
  postId: string;
  authorName: string | null;
  authorHandle: string | null;
  postedAt: string | null;
  savedAt: string;
  tags: string[];
  xPostUrl: string;
  parsedContent: ParsedContent | null;
}

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

export function ReaderContent({
  authorName,
  authorHandle,
  postedAt,
  tags,
  xPostUrl,
  parsedContent,
}: ReaderContentProps) {
  const [scrollProgress, setScrollProgress] = useState(0);

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

  const blocks = parsedContent?.blocks ?? [];
  const readTime = estimateReadTime(blocks);
  const displayName = authorName || authorHandle || "Unknown";

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
