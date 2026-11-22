-- Archive: hide a post from the library and reader feed without deleting it.
ALTER TABLE saved_posts ADD COLUMN archived_at timestamptz;
COMMENT ON COLUMN saved_posts.archived_at IS 'When set, the post is archived and hidden from the library and reader feeds';
