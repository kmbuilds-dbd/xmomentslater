import type { ParsedContent } from "@/lib/parser/parse-tweet";
export class IftttPayloadError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const MAX_BODY_BYTES = 64 * 1024;
/** Bound the actual stream, rather than trusting a caller's Content-Length. */
export async function readIftttBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader)
    throw new IftttPayloadError("Missing request body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done)
        break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new IftttPayloadError("Request body exceeds 64 KB", 413);
      }
      chunks.push(value);
    }
  }
  finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }
  catch {
    throw new IftttPayloadError("Invalid JSON body");
  }
}
export function parseIftttPayload(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new IftttPayloadError("Expected a JSON object");
  const body = input as Record<string, unknown>;
  function field(name: string, max: number): string {
    const value = body[name];
    if (typeof value !== "string" || !value.trim() || value.length > max)
      throw new IftttPayloadError(`Invalid ${name}`);
    return value.trim();
  }
  const text = field("text", 25000);
  const author = field("author", 200);
  const rawUrl = field("url", 2048);
  const rawDate = field("created_at", 200);
  let url: URL;
  try {
    url = new URL(rawUrl);
  }
  catch {
    throw new IftttPayloadError("Invalid X post URL");
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port || !/^(?:www\.)?(?:x\.com|twitter\.com)$/.test(url.hostname))
    throw new IftttPayloadError("Invalid X post URL");
  const match = url.pathname.match(/^\/(?:([A-Za-z0-9_]{1,15})|i\/web)\/status\/([1-9]\d{0,19})\/?$/);
  if (!match)
    throw new IftttPayloadError("Invalid X post URL");
  const authorHandle = author.replace(/^@/, "");
  const handle = match[1] && match[1] !== "i"
    ? match[1]
    : /^[A-Za-z0-9_]{1,15}$/.test(authorHandle) ? authorHandle : "";
  // IFTTT's default CreatedAt ingredient is human-readable ("... at 10:00AM PDT").
  const date = new Date(rawDate.replace(/ at /i, " ").replace(/(\d)(AM|PM)\b/i, "$1 $2"));
  if (!Number.isFinite(date.getTime()))
    throw new IftttPayloadError("Invalid created_at");
  const createdAt = date.toISOString();
  const canonicalUrl = `https://x.com/${handle || "i/web"}/status/${match[2]}`;
  const parsed: ParsedContent = { author, handle, date: createdAt, blocks: text.split(/\n\s*\n/).map(content => ({ type: "text" as const, content: content.trim() })).filter(block => block.content) };
  return { text, author, handle, postId: match[2], url: canonicalUrl, createdAt, parsed };
}
