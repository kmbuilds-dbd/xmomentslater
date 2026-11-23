-- Per-user Google/Gemini API key for the "Ask AI" feature.
-- Only the service role reads/writes this table (no RLS policies), so the
-- encrypted key is never exposed to the client or the user's own session.
create table ai_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_key text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table ai_keys enable row level security;
