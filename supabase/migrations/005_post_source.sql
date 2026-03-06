-- Add source column to distinguish how posts were added
ALTER TABLE saved_posts ADD COLUMN source text NOT NULL DEFAULT 'manual';
-- Values: 'manual' (bookmarklet/iOS Shortcut), 'bookmark' (X bookmark sync)

-- Add text_content column for full-text search
ALTER TABLE saved_posts ADD COLUMN text_content text;

-- Backfill text_content from parsed_content JSONB for existing posts
UPDATE saved_posts
SET text_content = (
  SELECT string_agg(elem->>'content', E'\n\n')
  FROM jsonb_array_elements(parsed_content->'blocks') AS elem
  WHERE elem->>'type' = 'text'
)
WHERE parsed_content IS NOT NULL;

-- Add last_bookmark_sync_at to x_connections
ALTER TABLE x_connections ADD COLUMN last_bookmark_sync_at timestamptz;
