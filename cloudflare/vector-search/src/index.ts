interface Env {
  OPENAI_API_KEY: string;
  VECTOR_SEARCH_SECRET: string;
  POST_VECTORS: VectorizeIndex;
}

interface VectorizeIndex {
  upsert(vectors: VectorizeVector[]): Promise<unknown>;
  deleteByIds(ids: string[]): Promise<unknown>;
  query(
    vector: number[],
    options: {
      topK: number;
      filter?: Record<string, string | number | boolean>;
      returnMetadata?: "all" | "none" | "indexed";
    }
  ): Promise<{ matches: VectorizeMatch[] }>;
}

interface VectorizeVector {
  id: string;
  values: number[];
  metadata?: VectorMetadata;
}

interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: VectorMetadata;
}

type VectorMetadata = Record<string, string | number | boolean>;

interface IndexPostRequest {
  postId: string;
  userId: string;
  xPostId: string;
  text: string;
  authorHandle?: string | null;
  title?: string | null;
  source?: string | null;
  savedAt?: string | null;
}

interface DeletePostRequest {
  postId: string;
  userId: string;
}

interface SearchRequest {
  userId: string;
  query: string;
  limit?: number;
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_EMBED_CHARS = 12000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function vectorId(userId: string, postId: string): string {
  return `${userId}:${postId}`;
}

function isAuthorized(request: Request, env: Env): boolean {
  return request.headers.get("authorization") === `Bearer ${env.VECTOR_SEARCH_SECRET}`;
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_EMBED_CHARS);
}

function optionalMetadata(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}

async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

async function embed(text: string, env: Env): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI embeddings failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const embedding = payload.data?.[0]?.embedding;
  if (!embedding?.length) {
    throw new Error("OpenAI embeddings response did not include an embedding");
  }
  return embedding;
}

async function handleIndex(request: Request, env: Env): Promise<Response> {
  const body = await readJson<IndexPostRequest>(request);
  const text = cleanText(body.text ?? "");

  if (!body.postId || !body.userId || !body.xPostId || !text) {
    return json({ error: "postId, userId, xPostId, and text are required" }, 400);
  }

  const values = await embed(text, env);
  const metadata: VectorMetadata = {
    user_id: body.userId,
    post_id: body.postId,
    x_post_id: body.xPostId,
  };

  const authorHandle = optionalMetadata(body.authorHandle);
  const title = optionalMetadata(body.title);
  const source = optionalMetadata(body.source);
  const savedAt = optionalMetadata(body.savedAt);

  if (authorHandle) metadata.author_handle = authorHandle;
  if (title) metadata.title = title;
  if (source) metadata.source = source;
  if (savedAt) metadata.saved_at = savedAt;

  await env.POST_VECTORS.upsert([
    {
      id: vectorId(body.userId, body.postId),
      values,
      metadata,
    },
  ]);

  return json({ success: true });
}

async function handleDelete(request: Request, env: Env): Promise<Response> {
  const body = await readJson<DeletePostRequest>(request);
  if (!body.postId || !body.userId) {
    return json({ error: "postId and userId are required" }, 400);
  }

  await env.POST_VECTORS.deleteByIds([vectorId(body.userId, body.postId)]);
  return json({ success: true });
}

async function handleSearch(request: Request, env: Env): Promise<Response> {
  const body = await readJson<SearchRequest>(request);
  const query = cleanText(body.query ?? "");
  if (!body.userId || !query) {
    return json({ matches: [] });
  }

  const values = await embed(query, env);
  const result = await env.POST_VECTORS.query(values, {
    topK: Math.min(Math.max(body.limit ?? 20, 1), 50),
    filter: { user_id: body.userId },
    returnMetadata: "all",
  });

  return json({
    matches: result.matches
      .map((match) => ({
        postId: String(match.metadata?.post_id ?? ""),
        score: match.score,
      }))
      .filter((match) => match.postId),
  });
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    if (!isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    try {
      if (request.method === "POST" && url.pathname === "/index-post") {
        return handleIndex(request, env);
      }
      if (request.method === "POST" && url.pathname === "/delete-post") {
        return handleDelete(request, env);
      }
      if (request.method === "POST" && url.pathname === "/search") {
        return handleSearch(request, env);
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error(error);
      return json(
        { error: error instanceof Error ? error.message : "Internal error" },
        500
      );
    }
  },
};

export default worker;
