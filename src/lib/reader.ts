import { mapSavedPostToLibraryPost, type SavedPostRow } from "@/lib/saved-posts";

/** Drives the card body: article embed vs video/image media vs plain text. */
export type PostKind = "article" | "video" | "image" | "text";

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
}

export interface SmartSection {
  id: "quick-pass" | "videos" | "to-try";
  title: string;
  blurb: string;
  actionLabel: "Start" | "Watch";
  posts: ReaderPost[];
}

interface RawMedia {
  type?: string;
  url?: string;
  preview_image_url?: string;
}

function rawMediaList(raw: unknown): RawMedia[] {
  if (!raw || typeof raw !== "object" || !("includes" in raw)) return [];
  const media = (raw as { includes?: { media?: RawMedia[] } }).includes?.media;
  return Array.isArray(media) ? media : [];
}

function detectKind(raw: unknown): PostKind {
  if (raw && typeof raw === "object" && "data" in raw) {
    if ((raw as { data?: { article?: unknown } }).data?.article) return "article";
  }
  const media = rawMediaList(raw);
  if (media.some((m) => m.type === "video" || m.type === "animated_gif")) {
    return "video";
  }
  if (media.some((m) => m.type === "photo")) return "image";
  return "text";
}

function extractMediaUrls(raw: unknown): string[] {
  return rawMediaList(raw)
    .map((m) => (m.type === "photo" ? m.url : m.preview_image_url))
    .filter((u): u is string => !!u);
}

function readMinutes(parsed: SavedPostRow["parsed_content"]): number {
  const words = (parsed?.blocks ?? [])
    .filter((b) => b.type === "text")
    .reduce((n, b) => n + b.content.split(/\s+/).length, 0);
  return Math.max(1, Math.ceil(words / 200));
}

export function mapSavedPostToReaderPost(post: SavedPostRow): ReaderPost {
  return {
    ...mapSavedPostToLibraryPost(post),
    kind: detectKind(post.raw_api_response),
    mediaUrls: extractMediaUrls(post.raw_api_response),
    readMinutes: readMinutes(post.parsed_content),
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
