import "server-only";
import { getAnthropicClient } from "@/lib/anthropic-client";

// Below this length there usually isn't enough signal to pick a real topic
// from (a one-line post, a link with no commentary, ...).
const TAGS_MIN_LENGTH = 40;

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

/**
 * Generate exactly two short topical tags for a post's content using
 * Claude. Returns null on failure, missing API key, or content too short
 * to reliably tag — callers should leave the post untagged in that case.
 */
export async function generateTags(
  text: string,
  title?: string
): Promise<string[] | null> {
  const client = getAnthropicClient();
  if (!client || text.trim().length < TAGS_MIN_LENGTH) return null;

  try {
    const input = title ? `Title: ${title}\n\n${text}` : text;

    const message = await client.messages.create({
      model: "claude-3-5-haiku-latest",
      max_tokens: 50,
      messages: [
        {
          role: "user",
          content: `Read this X post and pick exactly two short topical tags describing its subject matter (e.g. "ai", "startups", "climate", "sports"). Lowercase, 1-2 words each, no hashtags or punctuation. Respond with ONLY a JSON array of the two tags, nothing else.\n\n${input}`,
        },
      ],
    });

    const block = message.content[0];
    if (block.type !== "text") return null;
    return parseTagArray(block.text.trim());
  } catch (err) {
    console.error("Tag generation failed:", err);
    return null;
  }
}
