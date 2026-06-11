import 'server-only'

import { eq, and, desc } from 'drizzle-orm'
import { db } from '@/lib/db/drizzle'
import { userBookmarks } from '@/lib/db/schema'

export async function listUserBookmarkNewsItemIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ newsItemId: userBookmarks.newsItemId })
    .from(userBookmarks)
    .where(eq(userBookmarks.userId, userId))
    .orderBy(desc(userBookmarks.createdAt))

  return rows.map((r) => r.newsItemId)
}

export async function insertUserBookmark(userId: string, newsItemId: string): Promise<void> {
  try {
    await db.insert(userBookmarks).values({ userId, newsItemId })
  } catch (e: any) {
    if (e?.code !== '23505') throw e
  }
}

export async function deleteUserBookmark(userId: string, newsItemId: string): Promise<void> {
  await db
    .delete(userBookmarks)
    .where(and(eq(userBookmarks.userId, userId), eq(userBookmarks.newsItemId, newsItemId)))
}
