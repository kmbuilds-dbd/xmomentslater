# X OAuth Connection Flow — Design

## Context

Phase 2 of xMomentsLater. Users need to connect their X account so the app can fetch post content on their behalf. Uses OAuth 2.0 with PKCE (no client secret exposed to browser). Tokens encrypted at rest with AES-256-GCM.

## Data Flow

```
Dashboard "Connect X" button
  → GET /api/x/connect
  → Generate PKCE code_verifier + code_challenge (SHA-256)
  → Generate random state parameter
  → Store verifier + state in httpOnly cookies
  → Redirect to https://x.com/i/oauth2/authorize with scopes: tweet.read users.read
  → User authorizes
  → X redirects to /api/x/callback?code=...&state=...
  → Verify state cookie matches query param
  → POST https://api.x.com/2/oauth2/token (exchange code + verifier for tokens)
  → Encrypt access_token + refresh_token with AES-256-GCM
  → Fetch user info (GET /2/users/me) to get x_handle
  → Upsert into x_connections table
  → Delete cookies, redirect to /dashboard
```

## Database

### x_connections table

```sql
create table x_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  access_token text not null,         -- AES-256-GCM encrypted
  refresh_token text not null,        -- AES-256-GCM encrypted
  x_user_id text not null,            -- X's user ID
  x_handle text not null,             -- @handle
  token_expires_at timestamptz,       -- when access token expires
  connected_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(user_id)                     -- one X connection per user
);

-- RLS: users can only read their own connection
alter table x_connections enable row level security;
create policy "Users read own connection" on x_connections
  for select using (auth.uid() = user_id);
-- Insert/update/delete handled by server (service role key)
```

## Encryption

AES-256-GCM using `TOKEN_ENCRYPTION_KEY` env var (32-byte hex string).

Storage format: `{iv_hex}:{ciphertext_hex}:{authTag_hex}`

```typescript
// src/lib/encryption.ts
encrypt(plaintext: string): string   // → "iv:ciphertext:tag"
decrypt(encrypted: string): string   // → plaintext
```

Uses Node.js `crypto` module — no external dependencies.

## New Files

```
src/app/api/x/connect/route.ts      — Initiate PKCE flow, set cookies, redirect to X
src/app/api/x/callback/route.ts     — Exchange code, encrypt tokens, store, redirect
src/app/api/x/disconnect/route.ts   — Delete x_connections row, redirect
src/lib/x-api/oauth.ts              — PKCE helpers, token exchange, user info fetch
src/lib/encryption.ts               — AES-256-GCM encrypt/decrypt
src/components/XConnectionCard.tsx   — Connect/disconnect UI on dashboard
supabase/migrations/001_x_connections.sql — Table creation
```

## Modified Files

```
src/app/dashboard/page.tsx           — Add XConnectionCard
.env.local.example                   — Add X API + encryption env vars
CLAUDE.md                            — Update env vars section
```

## Environment Variables (new)

```
NEXT_PUBLIC_X_CLIENT_ID      — X OAuth app client ID
X_CLIENT_SECRET              — X OAuth app client secret (server-only)
TOKEN_ENCRYPTION_KEY          — 32-byte hex key for AES-256-GCM
```

## Scopes

`tweet.read users.read` — minimum for fetching posts and resolving user handles.

## Token Refresh

Not implemented in Phase 2. The refresh_token is stored for Phase 3 (bookmarklet/save endpoint) to use when making X API calls.

## Security

- PKCE prevents authorization code interception
- State parameter prevents CSRF
- Tokens encrypted at rest (AES-256-GCM with random IV per encryption)
- httpOnly cookies for PKCE verifier (never exposed to client JS)
- Service role key used for DB writes (not anon key)
- RLS on x_connections for read access
