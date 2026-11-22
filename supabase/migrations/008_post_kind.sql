-- Content kind for filtering by type (article, video, image, text).
ALTER TABLE saved_posts ADD COLUMN kind text;
COMMENT ON COLUMN saved_posts.kind IS 'Content kind: article, video, image, or text';

-- Backfill from the stored raw API response.
UPDATE saved_posts SET kind = CASE
  WHEN raw_api_response->'data'->'article' IS NOT NULL THEN 'article'
  WHEN EXISTS (
    SELECT 1 FROM jsonb_array_elements(raw_api_response->'includes'->'media') m
    WHERE m->>'type' IN ('video','animated_gif')
  ) THEN 'video'
  WHEN EXISTS (
    SELECT 1 FROM jsonb_array_elements(raw_api_response->'includes'->'media') m
    WHERE m->>'type' = 'photo'
  ) THEN 'image'
  ELSE 'text'
END;
