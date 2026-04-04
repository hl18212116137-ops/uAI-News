-- S2: Schema only — app 仍走现有读写路径；新列可空，老数据保持 NULL。
-- 在 Supabase SQL Editor 或 CLI 于低峰执行。

-- ---------------------------------------------------------------------------
-- processing_jobs（任务队列表，S3+ 由 worker 消费）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_post_id text REFERENCES public.raw_posts (id) ON DELETE CASCADE,
  -- 与 news_items.id 类型一致后再加 FK（部分库为 uuid，部分为 text）
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

CREATE INDEX IF NOT EXISTS processing_jobs_status_pending_idx
  ON public.processing_jobs (status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS processing_jobs_raw_post_id_idx
  ON public.processing_jobs (raw_post_id)
  WHERE raw_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS processing_jobs_created_at_idx
  ON public.processing_jobs (created_at DESC);

COMMENT ON TABLE public.processing_jobs IS 'AI/流水线异步任务；S2 仅建表，应用尚未写入';

COMMENT ON COLUMN public.processing_jobs.news_item_id IS '与 news_items.id 同形态；确认库内列类型后可加 FK';

ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- raw_posts 扩展（等价规划中的 raw_items 演进）
-- ---------------------------------------------------------------------------
ALTER TABLE public.raw_posts
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.sources (id) ON DELETE SET NULL;

ALTER TABLE public.raw_posts
  ADD COLUMN IF NOT EXISTS content_hash text;

ALTER TABLE public.raw_posts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'queued', 'processing', 'done', 'failed'));

ALTER TABLE public.raw_posts
  ADD COLUMN IF NOT EXISTS error_message text;

ALTER TABLE public.raw_posts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.raw_posts.status IS 'S2 默认 new；S4+ 可改为处理完标记 done 替代 delete';

-- 可选：按 url 去重唯一索引 — 历史重复行未清洗前勿启用
-- CREATE UNIQUE INDEX IF NOT EXISTS raw_posts_url_key ON public.raw_posts (url);

-- ---------------------------------------------------------------------------
-- news_items 扩展
-- ---------------------------------------------------------------------------
ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS raw_post_id text REFERENCES public.raw_posts (id) ON DELETE SET NULL;

ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS processing_status text
    CHECK (processing_status IS NULL OR processing_status IN ('ready', 'partial', 'failed'));

ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS insight_json jsonb;

COMMENT ON COLUMN public.news_items.raw_post_id IS '新流水线写入时回填；老数据 NULL';
COMMENT ON COLUMN public.news_items.insight_json IS 'INSIGHT 成品；S6 由 analysis/worker 写入';

CREATE INDEX IF NOT EXISTS news_items_raw_post_id_idx
  ON public.news_items (raw_post_id)
  WHERE raw_post_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- updated_at 维护（processing_jobs / raw_posts）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ainews_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS processing_jobs_set_updated_at ON public.processing_jobs;
CREATE TRIGGER processing_jobs_set_updated_at
  BEFORE UPDATE ON public.processing_jobs
  FOR EACH ROW
  EXECUTE PROCEDURE public.ainews_touch_updated_at();

DROP TRIGGER IF EXISTS raw_posts_set_updated_at ON public.raw_posts;
CREATE TRIGGER raw_posts_set_updated_at
  BEFORE UPDATE ON public.raw_posts
  FOR EACH ROW
  EXECUTE PROCEDURE public.ainews_touch_updated_at();
