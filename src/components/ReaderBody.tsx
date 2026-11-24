import type { ReaderPost } from "@/lib/reader";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** The reading surface itself: author header + content blocks with inline images. */
export function ReaderBody({ post }: { post: ReaderPost }) {
  const displayName = post.authorName || post.authorHandle || "Unknown";
  const date = post.postedAt ? formatDate(post.postedAt) : "";

  return (
    <article>
      {/* Author header */}
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary text-base font-semibold">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-[17px]">{displayName}</p>
          <p className="truncate text-sm text-muted-foreground">
            {post.authorHandle ? `@${post.authorHandle}` : ""}
            {post.authorHandle && date ? " · " : ""}
            {date}
          </p>
        </div>
      </header>

      {/* Body — inline images preserved in block order */}
      <div className="mt-6 space-y-6 text-[19px] leading-[1.6]">
        {post.blocks.map((block, i) => {
          if (block.type === "heading") {
            return (
              <h2
                key={i}
                className="text-xl font-semibold tracking-tight text-foreground"
              >
                {block.content}
              </h2>
            );
          }
          if (block.type === "image") {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={block.content}
                alt=""
                className="w-full rounded-xl"
                loading="lazy"
              />
            );
          }
          if (block.type === "quote") {
            return (
              <blockquote
                key={i}
                className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-[17px] text-muted-foreground"
              >
                {block.content}
              </blockquote>
            );
          }
          if (block.type === "thread") {
            return (
              <p
                key={i}
                className="whitespace-pre-wrap border-t border-border/60 pt-5 text-foreground"
              >
                {block.content}
              </p>
            );
          }
          return (
            <p key={i} className="whitespace-pre-wrap text-foreground">
              {block.content}
            </p>
          );
        })}

        {post.blocks.length === 0 && (
          <p className="text-muted-foreground">
            No content available.{" "}
            <a
              href={post.xPostUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Open on X
            </a>
          </p>
        )}
      </div>
    </article>
  );
}
