import type { XApiTweetResponse } from "./fetch-tweet";

export type BlockType = "text" | "image" | "heading";

export interface ParsedContent {
  author: string;
  handle: string;
  profileImageUrl?: string;
  date: string;
  blocks: Array<{ type: BlockType; content: string }>;
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

  let blocks: ParsedContent["blocks"] = [];

  // X Articles: parse plain_text into structured heading/paragraph blocks
  if (article?.plain_text?.trim()) {
    blocks = parseArticleBlocks(article.plain_text, article.title);
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

  // Image blocks from media actually attached to this tweet
  const attachedKeys = raw.data.attachments?.media_keys;
  if (attachedKeys?.length && raw.includes?.media) {
    const attachedSet = new Set(attachedKeys);
    for (const media of raw.includes.media) {
      if (attachedSet.has(media.media_key) && media.type === "photo" && media.url) {
        blocks.push({ type: "image", content: media.url });
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
