export interface ParsedContent {
  blocks?: { type: string; content: string }[];
}

export interface SavedPostRow {
  id: string;
  author_name: string | null;
  author_handle: string | null;
  posted_at: string | null;
  saved_at: string;
  read_at: string | null;
  tags: string[] | null;
  x_post_url: string;
  parsed_content: ParsedContent | null;
  raw_api_response: unknown;
  summary: string | null;
  title: string | null;
  source: string | null;
  category: string | null;
  kind: string | null;
}

export interface LibraryPost {
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

function getRawText(raw: unknown): string {
  if (!raw || typeof raw !== "object" || !("data" in raw)) return "";

  const data = (raw as { data?: { note_tweet?: { text?: string }; text?: string } }).data;
  return data?.note_tweet?.text ?? data?.text ?? "";
}

export function getPreview(parsed: ParsedContent | null, raw?: unknown): string {
  const textBlock = parsed?.blocks?.find((block) => block.type === "text");
  if (textBlock?.content) return textBlock.content.slice(0, 200);
  return getRawText(raw).slice(0, 200);
}

export function mapSavedPostToLibraryPost(post: SavedPostRow): LibraryPost {
  return {
    id: post.id,
    authorName: post.author_name,
    authorHandle: post.author_handle,
    postedAt: post.posted_at,
    savedAt: post.saved_at,
    readAt: post.read_at,
    tags: post.tags ?? [],
    xPostUrl: post.x_post_url,
    title: post.title,
    preview: post.summary ?? getPreview(post.parsed_content, post.raw_api_response),
    source: post.source ?? "manual",
    category: post.category ?? null,
  };
}
