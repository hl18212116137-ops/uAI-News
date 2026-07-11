'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AuthUser } from '@/lib/auth'
import type { NewsItem } from '@/lib/types'

type User = AuthUser

type BookmarkSnapshot = {
  bookmarkedIds: Set<string>
  pendingIds: Set<string>
  bookmarkedItems: NewsItem[]
}

type UseBookmarkOptions = {
  initialItems?: NewsItem[]
  /** Only use a route refresh for callers that truly need fresh RSC props after sync. */
  refreshOnSync?: boolean
}

const EMPTY_ITEMS: NewsItem[] = []

let storeUserId: string | null = null
let storeBookmarkedIds = new Set<string>()
let storePendingIds = new Set<string>()
let storeItems = new Map<string, NewsItem>()
let storeOverrides = new Map<string, boolean>()
const listeners = new Set<() => void>()

function getSnapshot(): BookmarkSnapshot {
  return {
    bookmarkedIds: new Set(storeBookmarkedIds),
    pendingIds: new Set(storePendingIds),
    bookmarkedItems: Array.from(storeBookmarkedIds)
      .map((id) => storeItems.get(id))
      .filter((item): item is NewsItem => item != null),
  }
}

function emitBookmarkChange() {
  listeners.forEach((listener) => listener())
}

function subscribeToBookmarkStore(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function ensureBookmarkStoreUser(userId: string | null) {
  if (storeUserId === userId) return
  storeUserId = userId
  storeBookmarkedIds = new Set()
  storePendingIds = new Set()
  storeItems = new Map()
  storeOverrides = new Map()
}

function moveBookmarkIdToFront(id: string) {
  const next = new Set<string>([id])
  storeBookmarkedIds.forEach((existing) => {
    if (existing !== id) next.add(existing)
  })
  storeBookmarkedIds = next
}

function hydrateBookmarkStore(
  userId: string | null,
  initialIds: Iterable<string>,
  initialItems: NewsItem[],
) {
  ensureBookmarkStoreUser(userId)

  const serverIds = Array.from(new Set(initialIds))
  const serverItems = new Map(initialItems.map((item) => [item.id, item]))

  if (storeOverrides.size === 0 && storePendingIds.size === 0) {
    storeBookmarkedIds = new Set(serverIds)
    storeItems = new Map()
    serverIds.forEach((id) => {
      const item = serverItems.get(id)
      if (item) storeItems.set(id, item)
    })
    emitBookmarkChange()
    return
  }

  serverIds.forEach((id) => {
    if (storeOverrides.get(id) === false) return
    storeBookmarkedIds.add(id)
    const item = serverItems.get(id)
    if (item) storeItems.set(id, item)
  })

  initialItems.forEach((item) => {
    if (storeBookmarkedIds.has(item.id) || storeOverrides.get(item.id) === true) {
      storeItems.set(item.id, item)
    }
  })

  storeOverrides.forEach((isBookmarked, id) => {
    if (isBookmarked) {
      moveBookmarkIdToFront(id)
      const item = serverItems.get(id)
      if (item) storeItems.set(id, item)
      return
    }
    storeBookmarkedIds.delete(id)
    storeItems.delete(id)
  })

  emitBookmarkChange()
}

function setBookmarkPending(id: string, pending: boolean) {
  if (pending) storePendingIds.add(id)
  else storePendingIds.delete(id)
  emitBookmarkChange()
}

function applyBookmarkState(id: string, isBookmarked: boolean, item?: NewsItem) {
  storeOverrides.set(id, isBookmarked)

  if (isBookmarked) {
    moveBookmarkIdToFront(id)
    if (item) storeItems.set(id, item)
  } else {
    storeBookmarkedIds.delete(id)
    storeItems.delete(id)
  }

  emitBookmarkChange()
}

export function useBookmark(
  initialIds: Set<string>,
  user: User | null,
  onNeedAuth: () => void,
  options: UseBookmarkOptions = {},
) {
  const router = useRouter()
  const userId = user?.id ?? null
  const initialItems = options.initialItems ?? EMPTY_ITEMS
  const refreshOnSync = options.refreshOnSync ?? false
  const initialIdsKey = useMemo(() => Array.from(initialIds).sort().join('\0'), [initialIds])
  const initialItemsKey = useMemo(
    () => initialItems.map((item) => item.id).sort().join('\0'),
    [initialItems],
  )
  const [snapshot, setSnapshot] = useState<BookmarkSnapshot>(() => {
    const itemById = new Map(initialItems.map((item) => [item.id, item]))
    return {
      bookmarkedIds: new Set(initialIds),
      pendingIds: new Set(),
      bookmarkedItems: Array.from(initialIds)
        .map((id) => itemById.get(id))
        .filter((item): item is NewsItem => item != null),
    }
  })
  const onNeedAuthRef = useRef(onNeedAuth)

  useEffect(() => {
    onNeedAuthRef.current = onNeedAuth
  }, [onNeedAuth])

  useEffect(() => {
    hydrateBookmarkStore(userId, initialIds, initialItems)
    setSnapshot(getSnapshot())
    return subscribeToBookmarkStore(() => setSnapshot(getSnapshot()))
  }, [userId, initialIds, initialItems, initialIdsKey, initialItemsKey])

  const toggleBookmark = useCallback(
    async (newsItemId: string, item?: NewsItem) => {
      if (!user) {
        onNeedAuthRef.current()
        return
      }
      if (storePendingIds.has(newsItemId)) return

      ensureBookmarkStoreUser(user.id)
      const wasBookmarked = storeBookmarkedIds.has(newsItemId)
      const previousItem = storeItems.get(newsItemId)

      setBookmarkPending(newsItemId, true)
      applyBookmarkState(newsItemId, !wasBookmarked, item ?? previousItem)

      try {
        if (wasBookmarked) {
          const res = await fetch(`/api/bookmarks?id=${encodeURIComponent(newsItemId)}`, {
            method: 'DELETE',
          })
          if (!res.ok) throw new Error('取消收藏失败')
        } else {
          const res = await fetch('/api/bookmarks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ news_item_id: newsItemId }),
          })
          if (!res.ok) throw new Error('收藏失败')
        }
        if (refreshOnSync) router.refresh()
      } catch (error) {
        console.error('[useBookmark] 同步失败，回滚状态:', error)
        applyBookmarkState(newsItemId, wasBookmarked, previousItem)
      } finally {
        setBookmarkPending(newsItemId, false)
      }
    },
    [refreshOnSync, router, user],
  )

  return { ...snapshot, toggleBookmark }
}
