import type { XApiTweetResponse } from "./fetch-tweet";

export type BlockType = "text" | "image" | "heading" | "quote" | "thread";

export interface ParsedContent {
  author: string;
  handle: string;
  profileImageUrl?: string;
  date: string;
  blocks: Array<{ type: BlockType; content: string }>;
  kind: "article" | "video" | "image" | "text";
}

type Media = NonNullable<NonNullable<XApiTweetResponse["includes"]>["media"]>[number];
type Block = ParsedContent["blocks"][number];

function mediaToImageBlock(media: Media): Block | null {
  if (media.type === "photo" && media.url) {
    return { type: "image", content: media.url };
  }
  if (
    (media.type === "video" || media.type === "animated_gif") &&
    media.preview_image_url
  ) {
    return { type: "image", content: media.preview_image_url };
  }
  return null;
}

/** Join prose blocks (text, quoted tweets, thread posts) for search and AI context. */
export function blocksToText(blocks: ParsedContent["blocks"]): string {
  return blocks
    .filter((b) => b.type === "text" || b.type === "quote" || b.type === "thread")
    .map((b) => b.content)
    .join("\n\n");
}

/**
 * Detect whether a line from article plain_text is likely a heading.
 * Headings are short lines that don't end with sentence punctuation.
 */
function isLikelyHeading(line: string): boolean {
  if (line.length > 80 || line.length < 2) return false;
  const lastChar = line.trim().slice(-1);
  // Sentence-ending punctuation → paragraph, not heading
  return ![".","!",";"].includes(lastChar);
}

/**
 * Best-effort: recover ordered blocks (with inline image positions) from an
 * X Article's structured body. The read-side shape is undocumented, so this
 * probes the known candidate fields and returns null when none is recognized.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseArticleStructured(article: any): ParsedContent["blocks"] | null {
  const list =
    article?.contents ??
    article?.blocks ??
    article?.body?.blocks ??
    article?.content_state?.blocks;
  if (!Array.isArray(list)) return null;

  const out: ParsedContent["blocks"] = [];
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const kind = String(b.type ?? b.kind ?? "").toLowerCase();
    if (kind === "image" || kind === "gif") {
      const url = b.url ?? b.previewUrl ?? b.preview_url ?? b.src;
      if (typeof url === "string" && url) out.push({ type: "image", content: url });
    } else if (kind === "header-one" || kind === "header-two" || kind === "header-three") {
      const text = String(b.text ?? "").trim();
      if (text) out.push({ type: "heading", content: text });
    } else if (kind === "atomic") {
      const url = b.url ?? b.data?.url ?? b.data?.media_items?.[0]?.url;
      if (typeof url === "string" && url) out.push({ type: "image", content: url });
    } else {
      const text = String(b.text ?? "").trim();
      if (!text) continue;
      if (kind === "unordered-list-item") out.push({ type: "text", content: `• ${text}` });
      else if (kind === "blockquote") out.push({ type: "quote", content: text });
      else out.push({ type: "text", content: text });
    }
  }
  return out.length ? out : null;
}

/**
 * Parse X Article plain_text into structured heading + paragraph blocks.
 */
function parseArticleBlocks(
  plainText: string,
  title?: string
): ParsedContent["blocks"] {
  const blocks: ParsedContent["blocks"] = [];

  if (title?.trim()) {
    blocks.push({ type: "heading", content: title.trim() });
  }

  const lines = plainText.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (isLikelyHeading(trimmed)) {
      blocks.push({ type: "heading", content: trimmed });
    } else {
      blocks.push({ type: "text", content: trimmed });
    }
  }

  return blocks;
}

export function parseTweet(raw: XApiTweetResponse): ParsedContent {
  const author = raw.includes?.users?.find((u) => u.id === raw.data.author_id);
  const article = raw.data.article;
  const allMedia = raw.includes?.media ?? [];
  const renderedMediaKeys = new Set<string>();

  let blocks: ParsedContent["blocks"] = [];

  if (article?.plain_text?.trim()) {
    blocks = parseArticleStructured(article) ?? parseArticleBlocks(article.plain_text, article.title);

    if (article.cover_media) {
      const coverMedia = allMedia.find(
        (m) => m.media_key === article.cover_media
      );
      const coverUrl = coverMedia?.url ?? coverMedia?.preview_image_url;
      if (coverUrl) {
        const insertAt = blocks.length > 0 && blocks[0].type === "heading" ? 1 : 0;
        blocks.splice(insertAt, 0, { type: "image", content: coverUrl });
        renderedMediaKeys.add(article.cover_media);
      }
    }
  } else {
    // Regular tweets / X Notes: use note_tweet.text or data.text
    const originalText = raw.data.note_tweet?.text ?? raw.data.text ?? "";
    let text = originalText;

    // Resolve shortened URLs in text
    try {
      const entities = raw.data.note_tweet?.entities ?? raw.data.entities;
      if (entities?.urls) {
        const sorted = [...entities.urls].sort((a, b) => b.start - a.start);
        for (const urlEntity of sorted) {
          if (
            typeof urlEntity.start === "number" &&
            typeof urlEntity.end === "number" &&
            urlEntity.expanded_url
          ) {
            text =
              text.slice(0, urlEntity.start) +
              urlEntity.expanded_url +
              text.slice(urlEntity.end);
          }
        }
      }
    } catch {
      text = originalText;
    }

    const finalText = text.trim() || originalText.trim();
    if (finalText) {
      blocks.push({ type: "text", content: finalText });
    }
  }

  const attachedKeys = raw.data.attachments?.media_keys;
  if (attachedKeys?.length) {
    const attachedSet = new Set(attachedKeys);
    for (const media of allMedia) {
      if (!attachedSet.has(media.media_key)) continue;
      if (renderedMediaKeys.has(media.media_key)) continue;
      const block = mediaToImageBlock(media);
      if (block) {
        blocks.push(block);
        renderedMediaKeys.add(media.media_key);
      }
    }
  }

  // Article inline images: X API merges the bearer-only article media into
  // includes.media but doesn't list them in attachments.media_keys, and
  // plain_text drops the inline positions. Append the leftovers after the body.
  if (article?.plain_text?.trim()) {
    for (const media of allMedia) {
      if (renderedMediaKeys.has(media.media_key)) continue;
      const block = mediaToImageBlock(media);
      if (block) {
        blocks.push(block);
        renderedMediaKeys.add(media.media_key);
      }
    }
  }

  // Quoted tweet: render its text and media inline after the main content.
  const quotedRef = raw.data.referenced_tweets?.find((r) => r.type === "quoted");
  if (quotedRef) {
    const quoted = raw.includes?.tweets?.find((t) => t.id === quotedRef.id);
    if (quoted) {
      const quotedText = quoted.note_tweet?.text ?? quoted.text ?? "";
      if (quotedText.trim()) {
        blocks.push({ type: "quote", content: quotedText.trim() });
      }
      for (const key of quoted.attachments?.media_keys ?? []) {
        if (renderedMediaKeys.has(key)) continue;
        const media = allMedia.find((m) => m.media_key === key);
        const block = media ? mediaToImageBlock(media) : null;
        if (block) {
          blocks.push(block);
          renderedMediaKeys.add(key);
        }
      }
    }
  }

  return {
    author: author?.name ?? "Unknown",
    handle: author?.username ?? "unknown",
    profileImageUrl: author?.profile_image_url,
    date: raw.data.created_at,
    blocks,
    kind: article
      ? "article"
      : allMedia.some((m) => m.type === "video" || m.type === "animated_gif")
        ? "video"
        : allMedia.some((m) => m.type === "photo")
          ? "image"
          : "text",
  };
}
