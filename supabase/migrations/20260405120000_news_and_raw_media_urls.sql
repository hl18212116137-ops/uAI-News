-- X 帖配图等：https URL 列表，可空；老数据 NULL
ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS media_urls jsonb;

ALTER TABLE public.raw_posts
  ADD COLUMN IF NOT EXISTS media_urls jsonb;

COMMENT ON COLUMN public.news_items.media_urls IS '外链图片 URL 数组（如 pbs.twimg.com），INSIGHT 展示';
COMMENT ON COLUMN public.raw_posts.media_urls IS '抓取时随推文写入，process 时带入 news_items';
