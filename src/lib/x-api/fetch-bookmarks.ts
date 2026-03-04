import { XApiError, type XApiTweetResponse } from "@/lib/parser";

const X_BOOKMARKS_URL = "https://api.x.com/2/users";

const TWEET_FIELDS =
  "text,created_at,author_id,entities,note_tweet,attachments,article";

export interface BookmarksResponse {
  data?: XApiTweetResponse["data"][];
  includes?: XApiTweetResponse["includes"];
  meta?: {
    result_count: number;
    next_token?: string;
  };
}

/**
 * Fetch a page of bookmarks for a user from X API v2.
 * Requires `bookmark.read` OAuth scope.
 */
export async function fetchBookmarks(
  accessToken: string,
  xUserId: string,
  paginationToken?: string
): Promise<BookmarksResponse> {
  const params = new URLSearchParams({
    "tweet.fields": TWEET_FIELDS,
    expansions: "author_id,attachments.media_keys",
    "user.fields": "name,username,profile_image_url",
    "media.fields": "url,preview_image_url,type,width,height",
    max_results: "100",
  });

  if (paginationToken) {
    params.set("pagination_token", paginationToken);
  }

  const url = `${X_BOOKMARKS_URL}/${xUserId}/bookmarks?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new XApiError(res.status, err);
  }

  return res.json();
}
