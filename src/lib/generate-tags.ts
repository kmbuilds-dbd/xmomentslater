import "server-only";
import { getAnthropicClient } from "@/lib/anthropic-client";

// Below this length there usually isn't enough signal to pick a real topic
// from (a one-line post, a link with no commentary, ...).
export const TAGS_MIN_LENGTH = 40;

function parseTagArray(raw: string): string[] | null {
  // Claude is asked for a bare JSON array but may still wrap it in prose or
  // a code fence — pull out the first [...] and parse that.
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;

    const tags = parsed
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 2);

    return tags.length ? tags : null;
  } catch {
    return null;
  }
}

export interface TagsDebugResult {
  tags: string[] | null;
  /** Present whenever tags is null — why generation didn't produce any. */
  error?: string;
}

/**
 * Same as generateTags() below, but reports *why* it came back empty
 * instead of swallowing the reason. Used by the admin tag backfill, where
 * "0 tagged" needs to be distinguishable from a bad API key, a model
 * response that ignored the format, and every other failure mode — they
 * all used to look identical from the outside.
 */
export async function generateTagsDebug(
  text: string,
  title?: string
): Promise<TagsDebugResult> {
  const client = getAnthropicClient();
  if (!client) return { tags: null, error: "ANTHROPIC_API_KEY not configured" };
  if (text.trim().length < TAGS_MIN_LENGTH) {
    return { tags: null, error: "content too short to tag" };
  }

  try {
    const input = title ? `Title: ${title}\n\n${text}` : text;

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      messages: [
        {
          role: "user",
          content: `Read this X post and pick exactly two short topical tags describing its subject matter (e.g. "ai", "startups", "climate", "sports"). Lowercase, 1-2 words each, no hashtags or punctuation. Respond with ONLY a JSON array of the two tags, nothing else.\n\n${input}`,
        },
      ],
    });

    const block = message.content[0];
    if (block.type !== "text") {
      return { tags: null, error: `unexpected response content type: ${block.type}` };
    }

    const tags = parseTagArray(block.text.trim());
    if (!tags) {
      return {
        tags: null,
        error: `couldn't parse tags from response: ${JSON.stringify(block.text.slice(0, 200))}`,
      };
    }
    return { tags };
  } catch (err) {
    return { tags: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Generate exactly two short topical tags for a post's content using
 * Claude. Returns null on failure, missing API key, or content too short
 * to reliably tag — callers should leave the post untagged in that case.
 */
const EXPECTED_SKIP_REASONS = ["ANTHROPIC_API_KEY not configured", "content too short to tag"];

export async function generateTags(
  text: string,
  title?: string
): Promise<string[] | null> {
  const { tags, error } = await generateTagsDebug(text, title);
  if (error && !EXPECTED_SKIP_REASONS.includes(error)) {
    console.error("Tag generation failed:", error);
  }
  return tags;
}
