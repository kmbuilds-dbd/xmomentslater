import type { XApiTweetResponse } from "./fetch-tweet";

export interface ParsedContent {
  author: string;
  handle: string;
  profileImageUrl?: string;
  date: string;
  blocks: Array<{ type: "text" | "image"; content: string }>;
}

export function parseTweet(raw: XApiTweetResponse): ParsedContent {
  const author = raw.includes?.users?.find((u) => u.id === raw.data.author_id);
  const article = raw.data.article;

  const blocks: ParsedContent["blocks"] = [];

  // X Articles: use article.plain_text (full article content) when available
  if (article?.plain_text?.trim()) {
    // Article title as a separate block if present
    if (article.title?.trim()) {
      blocks.push({ type: "text", content: article.title.trim() });
    }
    blocks.push({ type: "text", content: article.plain_text.trim() });
    // Note: article.cover_media is a media key string, not a URL — skip it
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

  // Image blocks from media attachments
  if (raw.includes?.media) {
    for (const media of raw.includes.media) {
      if (media.type === "photo" && media.url) {
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
