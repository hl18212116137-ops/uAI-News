import 'server-only'
import { db } from '@/lib/db/drizzle'
import { userBookmarks, newsItems } from '@/lib/db/schema'
import { eq, and, desc, inArray } from 'drizzle-orm'
import {
  mediaUrlsFromDbJson,
  referencedPostFromDbJson,
  socialEngagementFromDbJson,
  withCanonicalPostSourceUrl,
} from '@/lib/db/news'
import { NewsItem } from './types'

/**
 * 获取用户收藏的新闻 ID 列表
 */
export async function getUserBookmarkIds(userId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ newsItemId: userBookmarks.newsItemId })
      .from(userBookmarks)
      .where(eq(userBookmarks.userId, userId))
      .orderBy(desc(userBookmarks.createdAt))

    return rows.map(row => row.newsItemId)
  } catch (error) {
    console.error('Failed to get bookmark ids:', error)
    return []
  }
}

/**
 * 添加收藏
 */
export async function addBookmark(userId: string, newsItemId: string): Promise<void> {
  await db.insert(userBookmarks).values({ userId, newsItemId }).onConflictDoNothing()
}

/**
 * 取消收藏
 */
export async function removeBookmark(userId: string, newsItemId: string): Promise<void> {
  await db
    .delete(userBookmarks)
    .where(and(eq(userBookmarks.userId, userId), eq(userBookmarks.newsItemId, newsItemId)))
}

/**
 * 获取用户收藏的完整新闻列表（供 /bookmarks 页面使用）
 * 两步查询：先取 news_item_id 列表，再批量查 news_items
 */
export async function getBookmarkedNews(userId: string): Promise<NewsItem[]> {
  try {
    const bookmarks = await db
      .select({ newsItemId: userBookmarks.newsItemId })
      .from(userBookmarks)
      .where(eq(userBookmarks.userId, userId))
      .orderBy(desc(userBookmarks.createdAt))

    if (bookmarks.length === 0) return []

    const ids = bookmarks.map(b => b.newsItemId)

    const items = await db.select().from(newsItems).where(inArray(newsItems.id, ids))

    const itemMap = new Map(items.map(item => [item.id, item]))
    return ids
      .map(id => itemMap.get(id))
      .filter(Boolean)
      .map((item: any) =>
        withCanonicalPostSourceUrl({
          id: item.id,
          title: item.title,
          summary: item.summary,
          content: item.content,
          source: {
            platform: item.sourcePlatform,
            name: item.sourceName,
            handle: item.sourceHandle,
            url: item.sourceUrl,
          },
          category: item.category,
          publishedAt: item.publishedAt instanceof Date ? item.publishedAt.toISOString() : item.publishedAt,
          originalText: item.originalText,
          createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
          importanceScore: item.importanceScore,
          mediaUrls: mediaUrlsFromDbJson(item.mediaUrls),
          socialEngagement: socialEngagementFromDbJson(item.socialEngagement),
          referencedPost: referencedPostFromDbJson(item.referencedPost),
        }),
      ) as NewsItem[]
  } catch (error) {
    console.error('Failed to get bookmarked news:', error)
    return []
  }
}
