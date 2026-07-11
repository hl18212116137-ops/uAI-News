import 'server-only'

const FEED_VISIBLE_DAYS_DEFAULT = 7
const FEED_VISIBLE_DAYS_MAX = 90
const FEED_VISIBLE_DAYS_MIN = 1
const FEED_RECENTLY_FETCHED_HOURS_DEFAULT = 24
const FEED_RECENTLY_FETCHED_HOURS_MAX = 168
const FEED_RECENTLY_FETCHED_HOURS_MIN = 1

/** 全站列表 / 访客 feed 使用的可见天数（与 FEED_VISIBLE_DAYS 一致，1–90） */
export function getFeedVisibleDaysEffective(): number {
  const raw = parseInt(process.env.FEED_VISIBLE_DAYS || String(FEED_VISIBLE_DAYS_DEFAULT), 10)
  return Number.isFinite(raw)
    ? Math.min(FEED_VISIBLE_DAYS_MAX, Math.max(FEED_VISIBLE_DAYS_MIN, raw))
    : FEED_VISIBLE_DAYS_DEFAULT
}

/** 时间下界：列表 feed 只展示 `published_at >=` 该值（默认近 7 天） */
export function getFeedPublishedAtGte(): Date {
  const days = getFeedVisibleDaysEffective()
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

/**
 * 登录用户「订阅推荐流」的 published_at 下界：不得宽于全站窗口；若用户设置了更短 N 天则再收紧。
 */
export function getRecommendationFeedPublishedAtGte(userVisibleDays: number | null): Date {
  const site = getFeedVisibleDaysEffective()
  const n =
    userVisibleDays == null ? site : Math.min(site, Math.max(1, Math.floor(userVisibleDays)))
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}

/** 新抓取/新入库内容的短期置顶窗口；用 created_at 突破 published_at 可见窗口。 */
export function getRecentlyFetchedFeedCreatedAtGte(): Date {
  const raw = parseInt(
    process.env.NEXT_PUBLIC_FEED_RECENTLY_FETCHED_HOURS ||
      process.env.FEED_RECENTLY_FETCHED_HOURS ||
      String(FEED_RECENTLY_FETCHED_HOURS_DEFAULT),
    10
  )
  const hours = Number.isFinite(raw)
    ? Math.min(FEED_RECENTLY_FETCHED_HOURS_MAX, Math.max(FEED_RECENTLY_FETCHED_HOURS_MIN, raw))
    : FEED_RECENTLY_FETCHED_HOURS_DEFAULT
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}
