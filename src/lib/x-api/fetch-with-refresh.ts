import { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/encryption";
import { fetchTweet, XApiError, type XApiTweetResponse } from "@/lib/parser";
import { refreshAccessToken } from "./oauth";

export interface XConnection {
  access_token: string;
  refresh_token: string;
}

/**
 * Run an X API call with automatic OAuth token refresh on 401/403.
 *
 * Decrypts the stored access token and invokes `fn`. If X returns 401/403,
 * refreshes via the stored refresh token, persists the new pair, and retries
 * once. The new encrypted tokens are written back into `connection` so a caller
 * looping over many requests reuses the fresh pair instead of forcing a
 * refresh on every iteration.
 */
export async function withTokenRefresh<T>(
  fn: (accessToken: string) => Promise<T>,
  connection: XConnection,
  userId: string,
  admin: SupabaseClient
): Promise<T> {
  try {
    return await fn(decrypt(connection.access_token));
  } catch (err) {
    if (
      !(err instanceof XApiError) ||
      (err.status !== 401 && err.status !== 403)
    ) {
      throw err;
    }
  }

  const newTokens = await refreshAccessToken(decrypt(connection.refresh_token));
  const encryptedAccess = encrypt(newTokens.access_token);
  const encryptedRefresh = encrypt(newTokens.refresh_token);

  await admin
    .from("x_connections")
    .update({
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      token_expires_at: new Date(
        Date.now() + newTokens.expires_in * 1000
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  connection.access_token = encryptedAccess;
  connection.refresh_token = encryptedRefresh;

  return await fn(newTokens.access_token);
}

export function fetchTweetWithRefresh(params: {
  postId: string;
  connection: XConnection;
  userId: string;
  admin: SupabaseClient;
}): Promise<XApiTweetResponse> {
  return withTokenRefresh(
    (token) => fetchTweet(params.postId, token),
    params.connection,
    params.userId,
    params.admin
  );
}
