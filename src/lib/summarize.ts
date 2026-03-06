import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!_client) _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * Generate a 1-2 sentence summary of post content using Claude.
 * Returns null on failure — callers should fall back to truncated text.
 */
export async function generateSummary(
  text: string,
  title?: string
): Promise<string | null> {
  const client = getClient();
  if (!client || !text.trim()) return null;

  try {
    const input = title ? `Title: ${title}\n\n${text}` : text;

    const message = await client.messages.create({
      model: "claude-3-5-haiku-latest",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: `Summarize this X post in 1-2 concise sentences. Be direct, no preamble.\n\n${input}`,
        },
      ],
    });

    const block = message.content[0];
    return block.type === "text" ? block.text.trim() : null;
  } catch (err) {
    console.error("Summary generation failed:", err);
    return null;
  }
}
