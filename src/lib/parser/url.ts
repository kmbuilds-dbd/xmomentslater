/**
 * Extract tweet ID from an X/Twitter URL.
 * Handles: x.com, twitter.com, with/without www, with query params and trailing slashes.
 * Returns null if the URL doesn't match a valid post URL pattern.
 */
export function extractPostId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    if (hostname !== "x.com" && hostname !== "twitter.com") {
      return null;
    }
    // Pattern: /{user}/status/{id}
    const match = parsed.pathname.match(/^\/[^/]+\/status\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Extract article/note ID from an X article URL found in tweet text.
 * Handles: x.com/i/article/{id}, twitter.com/i/article/{id}
 * Returns null if not an article URL.
 */
export function extractArticleId(text: string): string | null {
  // Match article URLs in text (may be http or https, with or without www)
  const match = text.match(
    /https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/i\/article\/(\d+)/
  );
  return match ? match[1] : null;
}
