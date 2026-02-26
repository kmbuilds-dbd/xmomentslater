export interface XApiTweetResponse {
  data: {
    id: string;
    text: string;
    created_at: string;
    author_id: string;
    entities?: {
      urls?: Array<{ start: number; end: number; expanded_url: string; display_url: string }>;
      mentions?: Array<{ start: number; end: number; username: string }>;
    };
    note_tweet?: {
      text: string;
      entities?: {
        urls?: Array<{ start: number; end: number; expanded_url: string; display_url: string }>;
        mentions?: Array<{ start: number; end: number; username: string }>;
      };
    };
    article?: {
      title?: string;
      plain_text?: string;
      preview_text?: string;
      cover_media?: string; // media key string, not URL
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    };
    attachments?: { media_keys?: string[] };
  };
  includes?: {
    users?: Array<{ id: string; name: string; username: string; profile_image_url?: string }>;
    media?: Array<{ media_key: string; type: string; url?: string; preview_image_url?: string; width?: number; height?: number }>;
  };
}

/** Typed error from X API with HTTP status for retry logic. */
export class XApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`X API error (${status}): ${body}`);
    this.status = status;
  }
}

const X_TWEETS_URL = "https://api.x.com/2/tweets";

const TWEET_FIELDS =
  "text,created_at,author_id,entities,note_tweet,attachments,article";

function buildParams(): URLSearchParams {
  return new URLSearchParams({
    "tweet.fields": TWEET_FIELDS,
    expansions: "author_id,attachments.media_keys",
    "user.fields": "name,username,profile_image_url",
    "media.fields": "url,preview_image_url,type,width,height",
  });
}

async function fetchWithToken(
  postId: string,
  token: string
): Promise<XApiTweetResponse> {
  const params = buildParams();
  const res = await fetch(`${X_TWEETS_URL}/${postId}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new XApiError(res.status, err);
  }

  return res.json();
}

/**
 * Fetch tweet from X API v2. Uses the user's OAuth token first,
 * then retries with the app bearer token if the article field is missing
 * (article field requires app-level auth).
 */
export async function fetchTweet(
  postId: string,
  accessToken: string
): Promise<XApiTweetResponse> {
  const result = await fetchWithToken(postId, accessToken);

  // If no article content returned and app bearer token is available, retry
  // (article field requires app-level auth, not user OAuth)
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!result.data.article?.plain_text && bearerToken) {
    try {
      const retried = await fetchWithToken(postId, bearerToken);
      if (retried.data.article?.plain_text) {
        // Merge: use article from bearer response, keep rest from user response
        result.data.article = retried.data.article;
      }
    } catch (err) {
      console.error("Bearer token retry failed for article content:", err);
    }
  }

  return result;
}
