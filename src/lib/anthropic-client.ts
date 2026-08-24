import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null | undefined;

/** Shared Anthropic client, or null if ANTHROPIC_API_KEY isn't configured. */
export function getAnthropicClient(): Anthropic | null {
  if (_client === undefined) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    _client = apiKey ? new Anthropic({ apiKey }) : null;
  }
  return _client;
}

export function isAnthropicConfigured(): boolean {
  return getAnthropicClient() !== null;
}
