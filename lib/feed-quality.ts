import type { NewsItem } from '@/lib/types'
import { isDemoPostId } from '@/lib/demo-feed-posts'

/** 「推荐订阅」区块每次展示条数（客户端/服务端共用） */
export const RECOMMENDED_SIDEBAR_LIMIT = 4

/** 占位标题（无 AI 处理 / 回填失败） */
export function isPlaceholderNewsItem(item: Pick<NewsItem, 'title' | 'summary'>): boolean {
  const title = String(item.title ?? '').trim()
  const summary = String(item.summary ?? '').trim()
  return title.endsWith('的推文') || summary.startsWith('来自 @')
}

/** 列表 feed 最低重要性分（0–100）；低于此分不展示 */
export function getFeedMinImportanceScore(): number {
  const raw = parseInt(process.env.FEED_MIN_IMPORTANCE_SCORE || '55', 10)
  if (!Number.isFinite(raw)) return 55
  return Math.min(100, Math.max(0, raw))
}

/** 首页 / 订阅流：去掉占位帖、demo 帖与低分帖 */
export function filterPostsForPublicFeed(posts: NewsItem[]): NewsItem[] {
  const minScore = getFeedMinImportanceScore()
  return posts.filter((p) => {
    if (isDemoPostId(p.id)) return false
    if (isPlaceholderNewsItem(p)) return false
    const score = p.importanceScore
    if (typeof score === 'number' && Number.isFinite(score)) {
      return score >= minScore
    }
    // 已入库的真实 X 帖（x-*）若暂未打分，仍展示
    return typeof p.id === 'string' && p.id.startsWith('x-')
  })
}
