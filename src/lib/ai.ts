import "server-only";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import type { SavedPostRow } from "@/lib/saved-posts";

const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Decrypted Gemini API key for a user, or null when not configured. */
export async function getGeminiKey(userId: string): Promise<string | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return null;
  }
  const { data } = await adminClient()
    .from("ai_keys")
    .select("encrypted_key")
    .eq("user_id", userId)
    .single();
  if (!data?.encrypted_key) return null;
  try {
    return decrypt(data.encrypted_key);
  } catch {
    return null;
  }
}

export async function hasGeminiKey(userId: string): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return false;
  }
  const { data } = await adminClient()
    .from("ai_keys")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/** Human-readable context passed to the model for a saved post. */
export function buildPostContext(post: SavedPostRow): string {
  const parts: string[] = [];
  if (post.title) parts.push(`Title: ${post.title}`);
  if (post.author_name) parts.push(`Author: ${post.author_name}`);
  if (post.author_handle) parts.push(`Handle: @${post.author_handle}`);
  const text =
    post.text_content ??
    (post.parsed_content?.blocks ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.content)
      .join("\n\n") ??
    post.summary ??
    "";
  if (text.trim()) parts.push(`\n${text.trim()}`);
  return parts.join("\n");
}

export interface AskTurn {
  role: "user" | "model";
  text: string;
}

/** One Gemini call with the post as system context and prior turns inline. */
export async function askGemini(params: {
  apiKey: string;
  context: string;
  history: AskTurn[];
  question: string;
}): Promise<string> {
  const contents = [
    ...params.history.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
    { role: "user", parts: [{ text: params.question }] },
  ];

  const body = {
    systemInstruction: {
      parts: [
        {
          text:
            "You are a reading assistant. Answer the user's questions about the saved X (Twitter) post below, using its content and your general knowledge. Be concise and direct. Post content:\n\n" +
            params.context,
        },
      ],
    },
    contents,
    generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
  };

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": params.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error (${res.status}): ${text.slice(0, 300)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const answer =
    data?.candidates?.[0]?.content?.parts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ?.map((p: any) => p.text)
      .join("") ?? "";
  if (!answer.trim()) throw new Error("Gemini returned an empty response");
  return answer.trim();
}

/** Interpret a natural-language search into tags + free-text terms. */
export async function interpretSearchQuery(
  apiKey: string,
  query: string,
  allTags: string[]
): Promise<{ tags: string[]; terms: string[] }> {
  const prompt =
    "Convert the user's natural-language search into structured parameters.\n" +
    `Available tags on their saved posts: ${JSON.stringify(allTags)}\n` +
    `Query: "${query}"\n\n` +
    'Respond with ONLY a JSON object: {"tags":["..."],"terms":["..."]}. ' +
    '"tags" = tags from the available list that match the user intent (lowercase). ' +
    '"terms" = free-text keywords to match in the post body (lowercase). ' +
    "Empty arrays mean no filter.";

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 200 },
  };

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Gemini error (${res.status})`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ?.map((p: any) => p.text)
      .join("") ?? "";

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { tags: [], terms: [query.toLowerCase()] };
  try {
    const parsed = JSON.parse(match[0]);
    return {
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((t: unknown): t is string => typeof t === "string").map((t: string) => t.toLowerCase())
        : [],
      terms: Array.isArray(parsed.terms)
        ? parsed.terms.filter((t: unknown): t is string => typeof t === "string").map((t: string) => t.toLowerCase())
        : [],
    };
  } catch {
    return { tags: [], terms: [query.toLowerCase()] };
  }
}
