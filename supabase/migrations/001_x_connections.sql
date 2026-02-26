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
