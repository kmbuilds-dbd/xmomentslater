import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generatePKCE, generateState, buildAuthUrl } from "@/lib/x-api/oauth";

export async function GET() {
  const clientId = process.env.NEXT_PUBLIC_X_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "X Client ID not configured" }, { status: 500 });
  }

  const { verifier, challenge } = generatePKCE();
  const state = generateState();

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/api/x/callback`;

  const authUrl = buildAuthUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge: challenge,
  });

  const cookieStore = await cookies();

  cookieStore.set("x_oauth_verifier", verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  cookieStore.set("x_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(authUrl);
}
