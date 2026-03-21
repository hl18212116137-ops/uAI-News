'use client'

import { useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'

export function useBookmark(
  initialIds: Set<string>,
  user: User | null,
  onNeedAuth: () => void
) {
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(initialIds)

  const toggleBookmark = useCallback(async (newsItemId: string) => {
    if (!user) {
      onNeedAuth()
      return
    }

    const wasBookmarked = bookmarkedIds.has(newsItemId)

    // 1. 乐观更新：立即切换 UI
    setBookmarkedIds(prev => {
      const next = new Set(prev)
      wasBookmarked ? next.delete(newsItemId) : next.add(newsItemId)
      return next
    })

    // 2. 异步同步到服务端
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
    } catch (error) {
      console.error('[useBookmark] 同步失败，回滚状态:', error)
      // 3. 失败回滚
      setBookmarkedIds(prev => {
        const next = new Set(prev)
        wasBookmarked ? next.add(newsItemId) : next.delete(newsItemId)
        return next
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, bookmarkedIds, onNeedAuth])

  return { bookmarkedIds, toggleBookmark }
}
