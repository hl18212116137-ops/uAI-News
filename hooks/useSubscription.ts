'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

export function useSubscription(
  initialIds: Set<string>,
  user: User | null,
  onNeedAuth: () => void
) {
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(initialIds)
  const router = useRouter()

  const toggleSubscription = useCallback(
    async (sourceId: string, sourceHandle: string) => {
      if (!user) {
        onNeedAuth()
        return
      }

      const wasSubscribed = subscribedIds.has(sourceId)

      // 1. 乐观更新（按钮状态立即响应）
      setSubscribedIds(prev => {
        const next = new Set(prev)
        wasSubscribed ? next.delete(sourceId) : next.add(sourceId)
        return next
      })

      // 2. 异步同步到服务器
      try {
        if (wasSubscribed) {
          const res = await fetch(
            `/api/subscriptions?id=${encodeURIComponent(sourceId)}`,
            { method: 'DELETE' }
          )
          if (!res.ok) throw new Error('取消订阅失败')
        } else {
          const res = await fetch('/api/subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_id: sourceId, source_handle: sourceHandle }),
          })
          if (!res.ok) throw new Error('订阅失败')
        }

        // 3. 成功后刷新 Server Component 数据（feed 内容和 SourcesList 都会变化）
        router.refresh()
      } catch (error) {
        console.error('[useSubscription] 同步失败，回滚状态:', error)
        // 4. 失败回滚
        setSubscribedIds(prev => {
          const next = new Set(prev)
          wasSubscribed ? next.add(sourceId) : next.delete(sourceId)
          return next
        })
      }
    },
    [user, subscribedIds, onNeedAuth, router]
  )

  return { subscribedIds, toggleSubscription }
}
