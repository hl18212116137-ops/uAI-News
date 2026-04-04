'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'

export type SubscriptionMutateSuccessPayload = {
  action: 'subscribe' | 'unsubscribe'
  sourceId: string
  sourceHandle: string
}

export function useSubscription(
  initialIds: Set<string>,
  user: User | null,
  onNeedAuth: () => void,
  onMutateSuccess?: (payload: SubscriptionMutateSuccessPayload) => void | Promise<void>
) {
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(initialIds)
  const onSuccessRef = useRef(onMutateSuccess)
  useEffect(() => {
    onSuccessRef.current = onMutateSuccess
  }, [onMutateSuccess])

  const toggleSubscription = useCallback(
    async (sourceId: string, sourceHandle: string) => {
      if (!user) {
        onNeedAuth()
        return
      }

      const wasSubscribed = subscribedIds.has(sourceId)

      setSubscribedIds((prev) => {
        const next = new Set(prev)
        wasSubscribed ? next.delete(sourceId) : next.add(sourceId)
        return next
      })

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

        await onSuccessRef.current?.({
          action: wasSubscribed ? 'unsubscribe' : 'subscribe',
          sourceId,
          sourceHandle,
        })
      } catch (error) {
        console.error('[useSubscription] 同步失败，回滚状态:', error)
        setSubscribedIds((prev) => {
          const next = new Set(prev)
          wasSubscribed ? next.add(sourceId) : next.delete(sourceId)
          return next
        })
      }
    },
    [user, subscribedIds, onNeedAuth]
  )

  return { subscribedIds, toggleSubscription }
}
