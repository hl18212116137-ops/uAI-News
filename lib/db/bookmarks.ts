import 'server-only'

import { eq, and, desc, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/drizzle'
import { newsItems, userBookmarks } from '@/lib/db/schema'
import {
  mediaUrlsFromDbJson,
  referencedPostFromDbJson,
  socialEngagementFromDbJson,
  withCanonicalPostSourceUrl,
} from '@/lib/db/news'
import type { NewsItem } from '@/lib/types'

const BOOKMARK_NEWS_COLUMNS = {
  id: newsItems.id,
  title: newsItems.title,
  summary: newsItems.summary,
  content: newsItems.content,
  sourcePlatform: newsItems.sourcePlatform,
  sourceName: newsItems.sourceName,
  sourceHandle: newsItems.sourceHandle,
  sourceUrl: newsItems.sourceUrl,
  category: newsItems.category,
  publishedAt: newsItems.publishedAt,
  originalText: newsItems.originalText,
  createdAt: newsItems.createdAt,
  importanceScore: newsItems.importanceScore,
  mediaUrls: newsItems.mediaUrls,
  socialEngagement: newsItems.socialEngagement,
  referencedPost: newsItems.referencedPost,
}

function dateToIso(value: Date | string | null): string {
  if (value instanceof Date) return value.toISOString()
  return value ?? ''
}

export async function listUserBookmarkNewsItemIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ newsItemId: userBookmarks.newsItemId })
    .from(userBookmarks)
    .where(eq(userBookmarks.userId, userId))
    .orderBy(desc(userBookmarks.createdAt))

  return rows.map((r) => r.newsItemId)
}

export async function insertUserBookmark(userId: string, newsItemId: string): Promise<void> {
  await db.insert(userBookmarks).values({ userId, newsItemId }).onConflictDoNothing()
}

export async function deleteUserBookmark(userId: string, newsItemId: string): Promise<void> {
  await db
    .delete(userBookmarks)
    .where(and(eq(userBookmarks.userId, userId), eq(userBookmarks.newsItemId, newsItemId)))
}

export async function listBookmarkedNewsForUser(userId: string): Promise<NewsItem[]> {
  const bookmarks = await db
    .select({ newsItemId: userBookmarks.newsItemId })
    .from(userBookmarks)
    .where(eq(userBookmarks.userId, userId))
    .orderBy(desc(userBookmarks.createdAt))

  if (bookmarks.length === 0) return []

  const ids = bookmarks.map((bookmark) => bookmark.newsItemId)
  const items = await db
    .select(BOOKMARK_NEWS_COLUMNS)
    .from(newsItems)
    .where(inArray(newsItems.id, ids))

  const itemMap = new Map(items.map((item) => [item.id, item]))
  return ids
    .map((id) => itemMap.get(id))
    .filter((item): item is (typeof items)[number] => item != null)
    .map((item): NewsItem =>
      withCanonicalPostSourceUrl({
        id: item.id,
        title: item.title,
        summary: item.summary,
        content: item.content,
        source: {
          platform: item.sourcePlatform as NewsItem['source']['platform'],
          name: item.sourceName ?? '',
          handle: item.sourceHandle ?? '',
          url: item.sourceUrl ?? '',
        },
        category: item.category as NewsItem['category'],
        publishedAt: dateToIso(item.publishedAt),
        originalText: item.originalText ?? '',
        createdAt: dateToIso(item.createdAt),
        importanceScore: item.importanceScore ?? undefined,
        mediaUrls: mediaUrlsFromDbJson(item.mediaUrls),
        socialEngagement: socialEngagementFromDbJson(item.socialEngagement),
        referencedPost: referencedPostFromDbJson(item.referencedPost),
      }),
    )
}
