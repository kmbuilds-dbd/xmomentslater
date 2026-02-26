# X OAuth Connection Flow — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users connect their X account via OAuth 2.0 PKCE so the app can fetch posts on their behalf.

**Architecture:** Three API routes handle the OAuth flow (connect → callback → disconnect). Tokens are AES-256-GCM encrypted before storage in a `x_connections` Supabase table with RLS. A dashboard card shows connection status. Confidential client uses Basic Auth for token exchange.

**Tech Stack:** Next.js API routes, Node.js `crypto` (AES-256-GCM), Supabase (Postgres + RLS), X API v2 OAuth 2.0 PKCE

---

### Task 1: Encryption utility

**Files:**
- Create: `src/lib/encryption.ts`

**Step 1: Write encryption module**

```typescript
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`;
}

export function decrypt(encrypted: string): string {
  const [ivHex, ciphertextHex, authTagHex] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/encryption.ts
git commit -m "feat: add AES-256-GCM encryption utility for token storage"
```

---

### Task 2: X OAuth helpers

**Files:**
- Create: `src/lib/x-api/oauth.ts`

**Step 1: Write OAuth utility module**

```typescript
import { randomBytes, createHash } from "crypto";

const X_AUTH_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const X_USERS_ME_URL = "https://api.x.com/2/users/me";
const SCOPES = "tweet.read users.read offline.access";

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
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/x-api/oauth.ts
git commit -m "feat: add X OAuth PKCE helpers (auth URL, token exchange, user fetch)"
```

---

### Task 3: Database migration

**Files:**
- Create: `supabase/migrations/001_x_connections.sql`

**Step 1: Write migration SQL**

```sql
-- x_connections: stores encrypted OAuth tokens for X account connections
create table x_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  access_token text not null,
  refresh_token text not null,
  x_user_id text not null,
  x_handle text not null,
  token_expires_at timestamptz,
  connected_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(user_id)
);

-- RLS: users can only read their own connection
alter table x_connections enable row level security;

create policy "Users read own connection"
  on x_connections for select
  using (auth.uid() = user_id);

-- Index for fast lookups by user
create index idx_x_connections_user_id on x_connections(user_id);
```

**Step 2: Commit**

```bash
git add supabase/migrations/001_x_connections.sql
git commit -m "feat: add x_connections table migration with RLS"
```

> **Note:** This migration is applied manually via the Supabase dashboard SQL editor or `supabase db push` when Supabase is set up.

---

### Task 4: Connect API route

**Files:**
- Create: `src/app/api/x/connect/route.ts`

**Step 1: Write the connect route**

```typescript
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

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/x/callback`;

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
    maxAge: 600, // 10 minutes
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
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/api/x/connect/route.ts
git commit -m "feat: add /api/x/connect route (initiates OAuth PKCE flow)"
```

---

### Task 5: Callback API route

**Files:**
- Create: `src/app/api/x/callback/route.ts`

**Step 1: Write the callback route**

```typescript
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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

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
    // Exchange code for tokens (30-second window)
    const tokens = await exchangeCodeForTokens({
      code,
      redirectUri,
      codeVerifier,
      clientId,
      clientSecret,
    });

    // Fetch user info
    const xUser = await fetchXUser(tokens.access_token);

    // Encrypt tokens
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
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/api/x/callback/route.ts
git commit -m "feat: add /api/x/callback route (exchanges code, encrypts tokens, stores)"
```

---

### Task 6: Disconnect API route

**Files:**
- Create: `src/app/api/x/disconnect/route.ts`

**Step 1: Write the disconnect route**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  await adminClient
    .from("x_connections")
    .delete()
    .eq("user_id", user.id);

  return NextResponse.redirect(`${baseUrl}/dashboard`);
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/api/x/disconnect/route.ts
git commit -m "feat: add /api/x/disconnect route"
```

---

### Task 7: XConnectionCard component

**Files:**
- Create: `src/components/XConnectionCard.tsx`

**Step 1: Write the connection card**

A client component that shows either a "Connect X Account" button or the connected handle + disconnect button.

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { ExternalLink, Unlink } from "lucide-react";

interface XConnectionCardProps {
  xHandle: string | null;
}

export function XConnectionCard({ xHandle }: XConnectionCardProps) {
  const handleDisconnect = async () => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/x/disconnect";
    document.body.appendChild(form);
    form.submit();
  };

  if (xHandle) {
    return (
      <div className="flex items-center justify-between rounded-lg border px-5 py-4">
        <div>
          <p className="text-sm font-medium">X Account Connected</p>
          <p className="text-sm text-muted-foreground">@{xHandle}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleDisconnect}>
          <Unlink className="h-4 w-4 mr-2" />
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <a
      href="/api/x/connect"
      className="flex items-center justify-between rounded-lg border border-dashed px-5 py-4 hover:border-primary/50 transition-colors"
    >
      <div>
        <p className="text-sm font-medium">Connect your X account</p>
        <p className="text-sm text-muted-foreground">
          Required to save and read posts
        </p>
      </div>
      <ExternalLink className="h-4 w-4 text-muted-foreground" />
    </a>
  );
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/XConnectionCard.tsx
git commit -m "feat: add XConnectionCard component (connect/disconnect UI)"
```

---

### Task 8: Wire up dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Step 1: Update dashboard to show connection status**

The dashboard page fetches the user's X connection from the DB and passes it to the card. Uses the existing Supabase server client (reads go through RLS with anon key).

```typescript
import { createClient } from "@/lib/supabase/server";
import { XConnectionCard } from "@/components/XConnectionCard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch X connection (RLS ensures only own row)
  const { data: xConnection } = await supabase
    .from("x_connections")
    .select("x_handle")
    .single();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-tight mb-2">
        Your Library
      </h1>
      <p className="text-muted-foreground mb-8">
        {user?.email ? `Signed in as ${user.email}` : "Welcome"}
      </p>

      <div className="mb-12">
        <XConnectionCard xHandle={xConnection?.x_handle ?? null} />
      </div>

      <div className="rounded-lg border border-dashed py-16 px-8 text-center">
        <p className="font-[family-name:var(--font-fraunces)] text-lg text-muted-foreground mb-2">
          No saved posts yet
        </p>
        <p className="text-sm text-muted-foreground">
          {xConnection
            ? "Use the bookmarklet to save posts from X."
            : "Connect your X account above to get started."}
        </p>
      </div>
    </main>
  );
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: wire XConnectionCard into dashboard page"
```

---

### Task 9: Update env example and CLAUDE.md

**Files:**
- Modify: `.env.local.example`
- Modify: `CLAUDE.md`

**Step 1: Update .env.local.example**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_X_CLIENT_ID=
X_CLIENT_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
TOKEN_ENCRYPTION_KEY=
```

**Step 2: Update CLAUDE.md environment variables section**

Add `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `X_CONSUMER_KEY`, `X_CONSUMER_SECRET`, `X_BEARER_TOKEN` to the env vars section. Note which are used for what.

**Step 3: Commit**

```bash
git add .env.local.example CLAUDE.md
git commit -m "docs: update env vars for X OAuth connection"
```

---

### Task 10: Build verification

**Step 1: Run full build**

Run: `npm run build`
Expected: Compiles successfully, no TypeScript errors

**Step 2: Run lint**

Run: `npm run lint`
Expected: No lint errors

**Step 3: Final commit if any fixes needed**

---

## Testing the Flow (manual, once Supabase is set up)

1. Set real Supabase credentials in `.env.local`
2. Run the migration SQL in Supabase dashboard
3. `npm run dev`
4. Sign up / sign in
5. Click "Connect your X account" on dashboard
6. Should redirect to X authorization page
7. Authorize → redirects back to `/dashboard?x_connected=true`
8. Dashboard shows `@handle` with disconnect button
9. Click disconnect → handle disappears, connect button returns
