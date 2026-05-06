import type { XApiTweetResponse } from "./fetch-tweet";

export type BlockType = "text" | "image" | "heading";

export interface ParsedContent {
  author: string;
  handle: string;
  profileImageUrl?: string;
  date: string;
  blocks: Array<{ type: BlockType; content: string }>;
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
    blocks = parseArticleBlocks(article.plain_text, article.title);

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

  return {
    author: author?.name ?? "Unknown",
    handle: author?.username ?? "unknown",
    profileImageUrl: author?.profile_image_url,
    date: raw.data.created_at,
    blocks,
  };
}
