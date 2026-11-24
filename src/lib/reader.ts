import { mapSavedPostToLibraryPost, type SavedPostRow } from "@/lib/saved-posts";

/** Drives the card body: article embed vs video/image media vs plain text. */
export type PostKind = "article" | "video" | "image" | "text";

export interface ReaderBlock {
  type: "text" | "image" | "heading" | "quote" | "thread";
  content: string;
}

export interface ReaderPost {
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
  kind: PostKind;
  mediaUrls: string[];
  readMinutes: number;
  /** Content blocks in reading order (inline images preserved). */
  blocks: ReaderBlock[];
}

export interface SmartSection {
  id: "quick-pass" | "videos" | "to-try";
  title: string;
  blurb: string;
  actionLabel: "Start" | "Watch";
  posts: ReaderPost[];
}

interface RawMedia {
  media_key?: string;
  type?: string;
  url?: string;
  preview_image_url?: string;
}

function rawMediaList(raw: unknown): RawMedia[] {
  if (!raw || typeof raw !== "object" || !("includes" in raw)) return [];
  const media = (raw as { includes?: { media?: RawMedia[] } }).includes?.media;
  return Array.isArray(media) ? media : [];
}

/** Media belonging to this tweet only, per its attachments.media_keys.
 * Bulk imports share one `includes.media` across many tweets, so without this
 * every card would pick the same first image. */
function ownMedia(raw: unknown): RawMedia[] {
  const all = rawMediaList(raw);
  if (!raw || typeof raw !== "object" || !("data" in raw)) return all;
  const data = (raw as { data?: { attachments?: { media_keys?: string[] } } }).data;
  const keys = data?.attachments?.media_keys;
  if (!keys || keys.length === 0) return all;
  const keySet = new Set(keys);
  return all.filter((m) => m.media_key && keySet.has(m.media_key));
}

function detectKind(raw: unknown): PostKind {
  if (raw && typeof raw === "object" && "data" in raw) {
    if ((raw as { data?: { article?: unknown } }).data?.article) return "article";
  }
  const media = ownMedia(raw);
  if (media.some((m) => m.type === "video" || m.type === "animated_gif")) {
    return "video";
  }
  if (media.some((m) => m.type === "photo")) return "image";
  return "text";
}

function extractMediaUrls(raw: unknown): string[] {
  return ownMedia(raw)
    .map((m) => (m.type === "photo" ? m.url : m.preview_image_url))
    .filter((u): u is string => !!u);
}

function readMinutes(parsed: SavedPostRow["parsed_content"]): number {
  const words = (parsed?.blocks ?? [])
    .filter((b) => b.type === "text")
    .reduce((n, b) => n + b.content.split(/\s+/).length, 0);
  return Math.max(1, Math.ceil(words / 200));
}

function isLikelyHeading(line: string): boolean {
  if (line.length > 80 || line.length < 2) return false;
  return ![".", "!", ";"].includes(line.trim().slice(-1));
}

/** Recover ordered blocks from the raw X API response when parsed_content is empty. */
function extractBlocksFromRaw(raw: unknown): ReaderBlock[] {
  if (!raw || typeof raw !== "object" || !("data" in raw)) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (raw as any).data;
  const out: ReaderBlock[] = [];

  if (data?.article?.plain_text?.trim()) {
    if (data.article.title?.trim()) {
      out.push({ type: "heading", content: data.article.title.trim() });
    }
    for (const line of data.article.plain_text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      out.push({ type: isLikelyHeading(t) ? "heading" : "text", content: t });
    }
  } else {
    const text = data?.note_tweet?.text ?? data?.text;
    if (text?.trim()) out.push({ type: "text", content: text.trim() });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (raw as any).includes?.media ?? []) {
    if (m.type === "photo" && m.url) out.push({ type: "image", content: m.url });
    else if ((m.type === "video" || m.type === "animated_gif") && m.preview_image_url) {
      out.push({ type: "image", content: m.preview_image_url });
    }
  }
  return out;
}

export function getReaderBlocks(post: SavedPostRow): ReaderBlock[] {
  const blocks = post.parsed_content?.blocks;
  if (blocks && blocks.length > 0) return blocks as ReaderBlock[];
  return extractBlocksFromRaw(post.raw_api_response);
}

export function mapSavedPostToReaderPost(post: SavedPostRow): ReaderPost {
  return {
    ...mapSavedPostToLibraryPost(post),
    kind: (post.kind as PostKind) ?? detectKind(post.raw_api_response),
    mediaUrls: extractMediaUrls(post.raw_api_response),
    readMinutes: readMinutes(post.parsed_content),
    blocks: getReaderBlocks(post),
  };
}

/** Keywords that mark a post as something to act on, matched against tags. */
const ACTIONABLE_TAGS = [
  "tool",
  "guide",
  "tutorial",
  "how-to",
  "workflow",
  "skill",
  "plugin",
  "setup",
  "build",
  "agent",
  "claude",
  "automation",
];

export function isActionable(post: ReaderPost): boolean {
  const haystack = [
    ...post.tags.map((t) => t.toLowerCase()),
    (post.title ?? "").toLowerCase(),
  ].join(" ");
  return ACTIONABLE_TAGS.some((k) => haystack.includes(k));
}
