-- 远程库若未依次执行 20260405–20260407 迁移，抓取 upsert 会报 schema cache 缺列。
-- 本文件幂等补齐 news_items / raw_posts 上抓取与处理共用的 jsonb 列。

ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS media_urls jsonb;
ALTER TABLE public.raw_posts
  ADD COLUMN IF NOT EXISTS media_urls jsonb;

ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS social_engagement jsonb;
ALTER TABLE public.raw_posts
  ADD COLUMN IF NOT EXISTS social_engagement jsonb;

ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS referenced_post jsonb;
ALTER TABLE public.raw_posts
  ADD COLUMN IF NOT EXISTS referenced_post jsonb;

COMMENT ON COLUMN public.news_items.media_urls IS '外链图片 URL 数组（如 pbs.twimg.com），INSIGHT 展示';
COMMENT ON COLUMN public.raw_posts.media_urls IS '抓取时随推文写入，process 时带入 news_items';
COMMENT ON COLUMN public.news_items.social_engagement IS 'JSON：replyCount, retweetCount, likeCount, quoteCount, bookmarkCount, impressionCount';
COMMENT ON COLUMN public.raw_posts.social_engagement IS '抓取时随推文写入，process 时带入 news_items';
COMMENT ON COLUMN public.news_items.referenced_post IS 'X retweeted_tweet / quoted_tweet 解析结果';
COMMENT ON COLUMN public.raw_posts.referenced_post IS '抓取时写入，process 时带入 news_items';
