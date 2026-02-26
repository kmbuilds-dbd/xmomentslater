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

  // Prefer note_tweet.text for long posts / X Notes, fall back to data.text
  let text = raw.data.note_tweet?.text ?? raw.data.text;

  // Resolve shortened URLs in text
  const entities = raw.data.note_tweet?.entities ?? raw.data.entities;
  if (entities?.urls) {
    // Replace from end to start so indices stay valid
    const sorted = [...entities.urls].sort((a, b) => b.start - a.start);
    for (const urlEntity of sorted) {
      text =
        text.slice(0, urlEntity.start) +
        urlEntity.expanded_url +
        text.slice(urlEntity.end);
    }
  }

  const blocks: ParsedContent["blocks"] = [];

  // Text block
  if (text.trim()) {
    blocks.push({ type: "text", content: text.trim() });
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
