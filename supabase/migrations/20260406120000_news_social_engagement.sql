-- X 等平台的互动指标（抓取时写入，可空）
ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS social_engagement jsonb;

ALTER TABLE public.raw_posts
  ADD COLUMN IF NOT EXISTS social_engagement jsonb;

COMMENT ON COLUMN public.news_items.social_engagement IS 'JSON：replyCount, retweetCount, likeCount, quoteCount, bookmarkCount, impressionCount';
COMMENT ON COLUMN public.raw_posts.social_engagement IS '抓取时随推文写入，process 时带入 news_items';
