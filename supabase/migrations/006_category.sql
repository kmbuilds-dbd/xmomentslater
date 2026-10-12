-- Optional metadata for the API-free IFTTT ingestion path.
ALTER TABLE saved_posts ADD COLUMN category text
  CHECK (category IN ('technology', 'business', 'science', 'culture', 'health', 'politics', 'sports', 'other'));
COMMENT ON COLUMN saved_posts.category IS 'Automatic broad topic, null when enrichment is unavailable';
COMMENT ON COLUMN saved_posts.source IS 'manual (bookmarklet/API), bookmark (X sync), or ifttt (delivered text)';
