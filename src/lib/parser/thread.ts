import "server-only";
import { XApiError, type ParsedContent, type XApiTweetResponse } from "@/lib/parser";

/**
 * Fetch a thread: every tweet in the same conversation by the same author,
 * oldest first. Uses X API v2 recent search (tweets from the last 7 days).
 */
export async function fetchThreadConversation(
  accessToken: string,
  conversationId: string,
  authorHandle: string
): Promise<XApiTweetResponse["data"][]> {
  const params = new URLSearchParams({
    query: `conversation_id:${conversationId} from:${authorHandle}`,
    "tweet.fields": "text,created_at,author_id,note_tweet,attachments,referenced_tweets",
    expansions: "author_id,attachments.media_keys,referenced_tweets.id",
    "user.fields": "name,username,profile_image_url",
    "media.fields": "url,preview_image_url,type,width,height",
    max_results: "100",
  });

  const url = `https://api.x.com/2/tweets/search/recent?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new XApiError(res.status, err);
  }

  const data = (await res.json()) as { data?: XApiTweetResponse["data"][] };
  return (data.data ?? []).sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
}

/** Whether a tweet belongs to a thread we can unroll, and the lookup keys. */
export function threadKeys(raw: XApiTweetResponse): {
  conversationId: string;
  authorHandle: string;
} | null {
  const conversationId = raw.data.conversation_id;
  const authorHandle = raw.includes?.users?.find(
    (u) => u.id === raw.data.author_id
  )?.username;
  const isReply = raw.data.referenced_tweets?.some((r) => r.type === "replied_to");
  const replyCount = raw.data.public_metrics?.reply_count ?? 0;

  if (conversationId && authorHandle && (isReply || replyCount > 0)) {
    return { conversationId, authorHandle };
  }
  return null;
}

/**
 * Splice the thread into the parsed blocks: the saved tweet keeps its full
 * blocks (text + media); every other tweet becomes a `thread` block, ordered
 * oldest-first.
 */
export function unrollThread(
  parsed: ParsedContent,
  raw: XApiTweetResponse,
  thread: XApiTweetResponse["data"][]
): ParsedContent {
  if (thread.length <= 1) return parsed;

  const savedBlocks = parsed.blocks;
  const blocks: ParsedContent["blocks"] = [];
  for (const tweet of thread) {
    if (tweet.id === raw.data.id) {
      blocks.push(...savedBlocks);
    } else {
      const text = tweet.note_tweet?.text ?? tweet.text ?? "";
      if (text.trim()) blocks.push({ type: "thread", content: text.trim() });
    }
  }
  parsed.blocks = blocks;
  return parsed;
}
