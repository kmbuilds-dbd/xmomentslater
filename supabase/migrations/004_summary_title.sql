-- Add LLM-generated summary and extracted title columns
ALTER TABLE saved_posts ADD COLUMN summary text;
ALTER TABLE saved_posts ADD COLUMN title text;
