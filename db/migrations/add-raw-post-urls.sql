ALTER TABLE raw_posts
  ADD COLUMN IF NOT EXISTS urls jsonb;
