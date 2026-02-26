-- feed_tokens: per-user secret tokens for RSS feed access
create table feed_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz default now() not null
);

-- RLS: users can only read/manage their own token
alter table feed_tokens enable row level security;

create policy "Users select own feed token"
  on feed_tokens for select
  using (auth.uid() = user_id);

create policy "Users insert own feed token"
  on feed_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users delete own feed token"
  on feed_tokens for delete
  using (auth.uid() = user_id);

-- Index for fast lookup by token (used by RSS endpoint)
create index idx_feed_tokens_token on feed_tokens(token);
