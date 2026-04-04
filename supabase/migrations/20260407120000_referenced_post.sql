-- X 嵌套推文（转发 / 引用）：内层正文与媒体，供 INSIGHT ORIGINAL 分区
ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS referenced_post jsonb;

ALTER TABLE public.raw_posts
  ADD COLUMN IF NOT EXISTS referenced_post jsonb;

COMMENT ON COLUMN public.news_items.referenced_post IS 'X retweeted_tweet / quoted_tweet 解析结果';
COMMENT ON COLUMN public.raw_posts.referenced_post IS '抓取时写入，process 时带入 news_items';
