-- 推荐池标记：已有库执行本脚本一次（init.sql 新装已含该列）
ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS in_recommendation_pool boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS sources_recommendation_pool_idx
  ON sources (in_recommendation_pool)
  WHERE in_recommendation_pool = true;
