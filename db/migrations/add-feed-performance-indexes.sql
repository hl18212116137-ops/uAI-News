CREATE INDEX IF NOT EXISTS news_items_recommended_feed_idx
  ON news_items (importance_score DESC, published_at DESC)
  WHERE importance_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS news_items_source_feed_idx
  ON news_items (source_handle, published_at DESC, created_at DESC)
  WHERE source_handle IS NOT NULL;

CREATE INDEX IF NOT EXISTS news_items_longform_published_idx
  ON news_items (published_at DESC)
  WHERE longform_json IS NOT NULL;

CREATE INDEX IF NOT EXISTS raw_posts_processable_queue_idx
  ON raw_posts (status, created_at ASC)
  WHERE status IN ('new', 'queued');

CREATE INDEX IF NOT EXISTS processing_jobs_pending_created_at_idx
  ON processing_jobs (created_at ASC)
  WHERE status = 'pending';
