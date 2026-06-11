-- ainews-v2 初始化建表脚本
-- 用于阿里云 ECS PostgreSQL 一键建库
-- 执行方式: psql -U ainews -d ainews -f init.sql

-- ─── 扩展 ───────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── users（用户表，NextAuth credentials 认证） ─────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── sources（信息源） ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL DEFAULT 'blogger',
  platform text NOT NULL DEFAULT 'X',
  handle text NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  avatar text,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  in_recommendation_pool boolean NOT NULL DEFAULT false,
  added_at timestamptz NOT NULL DEFAULT now(),
  last_fetched_at timestamptz,
  fetch_config jsonb
);

CREATE INDEX IF NOT EXISTS sources_handle_platform_idx ON sources (handle, platform);
CREATE INDEX IF NOT EXISTS sources_recommendation_pool_idx ON sources (in_recommendation_pool) WHERE in_recommendation_pool = true;

-- ─── raw_posts（原始抓取帖子） ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS raw_posts (
  id text PRIMARY KEY,
  url text,
  author text,
  content text,
  title text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  source_id uuid REFERENCES sources (id) ON DELETE SET NULL,
  content_hash text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'queued', 'processing', 'done', 'failed')),
  error_message text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  media_urls jsonb,
  social_engagement jsonb,
  referenced_post jsonb
);

CREATE INDEX IF NOT EXISTS raw_posts_source_id_idx ON raw_posts (source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS raw_posts_status_idx ON raw_posts (status) WHERE status = 'new';

-- ─── news_items（新闻条目） ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news_items (
  id text PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  source_platform text,
  source_name text,
  source_handle text,
  source_url text,
  category text,
  published_at timestamptz NOT NULL DEFAULT now(),
  original_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  importance_score integer,
  media_urls jsonb,
  social_engagement jsonb,
  referenced_post jsonb,
  raw_post_id text REFERENCES raw_posts (id) ON DELETE SET NULL,
  processing_status text
    CHECK (processing_status IS NULL OR processing_status IN ('ready', 'partial', 'failed')),
  insight_json jsonb
);

CREATE INDEX IF NOT EXISTS news_items_published_at_idx ON news_items (published_at DESC);
CREATE INDEX IF NOT EXISTS news_items_source_handle_idx ON news_items (source_handle);
CREATE INDEX IF NOT EXISTS news_items_importance_score_idx ON news_items (importance_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS news_items_raw_post_id_idx ON news_items (raw_post_id) WHERE raw_post_id IS NOT NULL;

-- ─── user_source_subscriptions（用户订阅） ──────────────────────────────────
CREATE TABLE IF NOT EXISTS user_source_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  source_handle text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_id)
);

CREATE INDEX IF NOT EXISTS user_source_subscriptions_user_id_idx ON user_source_subscriptions (user_id);

-- ─── user_bookmarks（用户收藏） ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  news_item_id text NOT NULL REFERENCES news_items (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, news_item_id)
);

CREATE INDEX IF NOT EXISTS user_bookmarks_user_id_idx ON user_bookmarks (user_id);

-- ─── site_pipeline_settings（站点流水线配置） ────────────────────────────────
CREATE TABLE IF NOT EXISTS site_pipeline_settings (
  id text PRIMARY KEY DEFAULT 'default',
  raw_min_outer_chars integer,
  raw_min_nested_chars_retweet integer,
  ingest_dedupe_rss_blog_match_news_url boolean,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── user_pipeline_rules（用户流水线规则） ───────────────────────────────────
CREATE TABLE IF NOT EXISTS user_pipeline_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('dedupe', 'prefilter', 'curation', 'recommendation')),
  rule_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_pipeline_rules_user_module_idx ON user_pipeline_rules (user_id, module);

-- ─── processing_jobs（后台处理任务） ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_post_id text REFERENCES raw_posts (id) ON DELETE CASCADE,
  news_item_id text,
  job_type text NOT NULL DEFAULT 'full_pipeline'
    CHECK (job_type IN ('translate', 'summarize', 'classify', 'score', 'insight', 'full_pipeline')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processing_jobs_status_pending_idx ON processing_jobs (status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS processing_jobs_raw_post_id_idx ON processing_jobs (raw_post_id) WHERE raw_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS processing_jobs_created_at_idx ON processing_jobs (created_at DESC);

-- ─── 触发器：自动更新 updated_at ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ainews_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER processing_jobs_set_updated_at
  BEFORE UPDATE ON processing_jobs
  FOR EACH ROW EXECUTE PROCEDURE ainews_touch_updated_at();

CREATE TRIGGER raw_posts_set_updated_at
  BEFORE UPDATE ON raw_posts
  FOR EACH ROW EXECUTE PROCEDURE ainews_touch_updated_at();

-- ─── 初始配置数据 ───────────────────────────────────────────────────────────
INSERT INTO site_pipeline_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
