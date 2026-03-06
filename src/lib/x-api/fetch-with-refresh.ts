import { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/encryption";
import { fetchTweet, XApiError, type XApiTweetResponse } from "@/lib/parser";
import { refreshAccessToken } from "./oauth";

/**
 * Fetch a tweet with automatic OAuth token refresh on 401.
 *
 * On success, returns the X API response.
 * If the access token is expired, refreshes it, updates the DB, and retries once.
 * Throws on unrecoverable errors.
 */
export async function fetchTweetWithRefresh(params: {
  postId: string;
  connection: { access_token: string; refresh_token: string };
  userId: string;
  admin: SupabaseClient;
}): Promise<XApiTweetResponse> {
  const { postId, connection, userId, admin } = params;

  const accessToken = decrypt(connection.access_token);
  try {
    return await fetchTweet(postId, accessToken);
  } catch (err) {
    if (!(err instanceof XApiError && err.status === 401)) {
      throw err;
    }
  }

  // Token expired — refresh and retry once
  console.log("Access token expired, refreshing...");
  const refreshToken = decrypt(connection.refresh_token);
  const newTokens = await refreshAccessToken(refreshToken);

  await admin
    .from("x_connections")
    .update({
      access_token: encrypt(newTokens.access_token),
      refresh_token: encrypt(newTokens.refresh_token),
      token_expires_at: new Date(
        Date.now() + newTokens.expires_in * 1000
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return await fetchTweet(postId, newTokens.access_token);
}
