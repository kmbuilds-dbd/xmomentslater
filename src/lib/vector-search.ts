import "server-only";

export interface IndexSavedPostVectorInput {
  postId: string;
  userId: string;
  xPostId: string;
  text: string | null;
  authorHandle?: string | null;
  title?: string | null;
  source?: string | null;
  savedAt?: string | null;
}

export interface DeleteSavedPostVectorInput {
  postId: string;
  userId: string;
}

export interface SearchSavedPostVectorsInput {
  userId: string;
  query: string;
  limit?: number;
}

export interface VectorSearchMatch {
  postId: string;
  score: number;
}

function getVectorSearchConfig(): { url: string; secret: string } | null {
  const url = process.env.VECTOR_SEARCH_WORKER_URL?.replace(/\/$/, "");
  const secret = process.env.VECTOR_SEARCH_SECRET;
  if (!url || !secret) return null;
  return { url, secret };
}

async function callVectorWorker<T>(
  path: string,
  body: object
): Promise<T> {
  const config = getVectorSearchConfig();
  if (!config) {
    throw new Error("Vector search is not configured");
  }

  const response = await fetch(`${config.url}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vector search request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
}

export function isVectorSearchConfigured(): boolean {
  return getVectorSearchConfig() !== null;
}

export async function indexSavedPostVector(
  input: IndexSavedPostVectorInput
): Promise<void> {
  const text = input.text?.trim();
  if (!text || !isVectorSearchConfigured()) return;

  await callVectorWorker<{ success: true }>("/index-post", {
    ...input,
    text,
  });
}

export async function deleteSavedPostVector(
  input: DeleteSavedPostVectorInput
): Promise<void> {
  if (!isVectorSearchConfigured()) return;
  await callVectorWorker<{ success: true }>("/delete-post", input);
}

export async function searchSavedPostVectors(
  input: SearchSavedPostVectorsInput
): Promise<VectorSearchMatch[]> {
  if (!isVectorSearchConfigured()) {
    throw new Error("Vector search is not configured");
  }

  const result = await callVectorWorker<{ matches: VectorSearchMatch[] }>(
    "/search",
    input
  );
  return result.matches;
}
