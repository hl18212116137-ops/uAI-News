import 'server-only'

const FEED_VISIBLE_DAYS_DEFAULT = 7
const FEED_VISIBLE_DAYS_MAX = 90
const FEED_VISIBLE_DAYS_MIN = 1

/** ISO 时间下界：列表 feed 只展示 `published_at >=` 该值（默认近 7 天） */
export function getFeedPublishedAtGte(): string {
  const raw = parseInt(process.env.FEED_VISIBLE_DAYS || String(FEED_VISIBLE_DAYS_DEFAULT), 10)
  const days = Number.isFinite(raw)
    ? Math.min(FEED_VISIBLE_DAYS_MAX, Math.max(FEED_VISIBLE_DAYS_MIN, raw))
    : FEED_VISIBLE_DAYS_DEFAULT
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}
