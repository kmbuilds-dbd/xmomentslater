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
