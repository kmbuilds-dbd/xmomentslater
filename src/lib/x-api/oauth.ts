import { randomBytes, createHash } from "crypto";

const X_AUTH_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const X_USERS_ME_URL = "https://api.x.com/2/users/me";
const SCOPES = "tweet.read users.read bookmark.read offline.access";

export function generatePKCE() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function generateState(): string {
  return randomBytes(16).toString("hex");
}

export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(X_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
}): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    code: params.code,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });

  const basicAuth = Buffer.from(
    `${params.clientId}:${params.clientSecret}`
  ).toString("base64");

  const res = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${err}`);
  }

  return res.json();
}

/**
 * Use a refresh token to obtain a new access token from X.
 * Returns fresh access_token, refresh_token, and expires_in.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const clientId = process.env.NEXT_PUBLIC_X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing X OAuth credentials for token refresh");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const res = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${err}`);
  }

  return res.json();
}

export async function fetchXUser(accessToken: string): Promise<{
  id: string;
  name: string;
  username: string;
}> {
  const res = await fetch(X_USERS_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Fetch user failed (${res.status}): ${err}`);
  }

  const json = await res.json();
  return json.data;
}
