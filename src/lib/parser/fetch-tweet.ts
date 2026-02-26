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
    attachments?: { media_keys?: string[] };
  };
  includes?: {
    users?: Array<{ id: string; name: string; username: string; profile_image_url?: string }>;
    media?: Array<{ media_key: string; type: string; url?: string; preview_image_url?: string; width?: number; height?: number }>;
  };
}

const X_TWEETS_URL = "https://api.x.com/2/tweets";

export async function fetchTweet(postId: string, accessToken: string): Promise<XApiTweetResponse> {
  const params = new URLSearchParams({
    "tweet.fields": "text,created_at,author_id,entities,note_tweet,attachments",
    expansions: "author_id,attachments.media_keys",
    "user.fields": "name,username,profile_image_url",
    "media.fields": "url,preview_image_url,type,width,height",
  });

  const res = await fetch(`${X_TWEETS_URL}/${postId}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`X API fetch failed (${res.status}): ${err}`);
  }

  return res.json();
}
