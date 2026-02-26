import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, fetchXUser } from "@/lib/x-api/oauth";
import { encrypt } from "@/lib/encryption";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

  // User denied access
  if (error) {
    return NextResponse.redirect(`${baseUrl}/dashboard?error=x_auth_denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/dashboard?error=x_auth_missing_params`);
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("x_oauth_state")?.value;
  const codeVerifier = cookieStore.get("x_oauth_verifier")?.value;

  // Clean up cookies
  cookieStore.delete("x_oauth_state");
  cookieStore.delete("x_oauth_verifier");

  if (!storedState || state !== storedState) {
    return NextResponse.redirect(`${baseUrl}/dashboard?error=x_auth_state_mismatch`);
  }

  if (!codeVerifier) {
    return NextResponse.redirect(`${baseUrl}/dashboard?error=x_auth_no_verifier`);
  }

  const clientId = process.env.NEXT_PUBLIC_X_CLIENT_ID!;
  const clientSecret = process.env.X_CLIENT_SECRET!;
  const redirectUri = `${baseUrl}/api/x/callback`;

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      redirectUri,
      codeVerifier,
      clientId,
      clientSecret,
    });

    const xUser = await fetchXUser(tokens.access_token);

    const encryptedAccessToken = encrypt(tokens.access_token);
    const encryptedRefreshToken = encrypt(tokens.refresh_token);

    // Get current user from Supabase
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${baseUrl}/login`);
    }

    // Upsert connection (service role for write access past RLS)
    const { createClient: createAdminClient } = await import("@supabase/supabase-js");
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: dbError } = await adminClient
      .from("x_connections")
      .upsert(
        {
          user_id: user.id,
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          x_user_id: xUser.id,
          x_handle: xUser.username,
          token_expires_at: new Date(
            Date.now() + tokens.expires_in * 1000
          ).toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (dbError) {
      console.error("Failed to store X connection:", dbError);
      return NextResponse.redirect(`${baseUrl}/dashboard?error=x_auth_db_error`);
    }

    return NextResponse.redirect(`${baseUrl}/dashboard?x_connected=true`);
  } catch (err) {
    console.error("X OAuth callback error:", err);
    return NextResponse.redirect(`${baseUrl}/dashboard?error=x_auth_failed`);
  }
}
