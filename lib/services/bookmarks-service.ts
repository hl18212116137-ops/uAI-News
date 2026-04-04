import 'server-only'

import {
  deleteUserBookmark,
  insertUserBookmark,
  listUserBookmarkNewsItemIds,
} from '@/lib/db/bookmarks'

export async function getBookmarkedIdsForUser(userId: string): Promise<string[]> {
  return listUserBookmarkNewsItemIds(userId)
}

export async function addBookmarkForUser(userId: string, newsItemId: string): Promise<void> {
  return insertUserBookmark(userId, newsItemId)
}

export async function removeBookmarkForUser(userId: string, newsItemId: string): Promise<void> {
  return deleteUserBookmark(userId, newsItemId)
}
