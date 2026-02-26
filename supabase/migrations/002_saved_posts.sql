-- saved_posts: stores parsed X posts with optional freeform tags
create table saved_posts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  x_post_id text not null,
  x_post_url text not null,
  author_name text,
  author_handle text,
  posted_at timestamptz,
  saved_at timestamptz default now() not null,
  read_at timestamptz,
  tags text[] default '{}',
  raw_api_response jsonb,
  parsed_content jsonb,
  unique(user_id, x_post_id)
);

-- RLS: users can only access their own saved posts
alter table saved_posts enable row level security;

create policy "Users select own posts"
  on saved_posts for select
  using (auth.uid() = user_id);

create policy "Users insert own posts"
  on saved_posts for insert
  with check (auth.uid() = user_id);

create policy "Users update own posts"
  on saved_posts for update
  using (auth.uid() = user_id);

create policy "Users delete own posts"
  on saved_posts for delete
  using (auth.uid() = user_id);

-- Indexes
create index idx_saved_posts_user_id on saved_posts(user_id);
create index idx_saved_posts_tags on saved_posts using gin(tags);
