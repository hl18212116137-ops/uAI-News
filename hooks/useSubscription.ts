'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { AuthUser } from '@/lib/auth'
type User = AuthUser

function normalizeHandle(handle: string): string {
  return String(handle ?? '').trim().replace(/^@+/, '').toLowerCase()
}

export type SubscriptionMutateSuccessPayload = {
  action: 'subscribe' | 'unsubscribe'
  sourceId: string
  sourceHandle: string
  /** 服务端解析后的 sources.id（订阅 API 返回） */
  resolvedSourceId?: string
  fetchTaskId?: string
}

export type SubscribeSourceResult = {
  ok: boolean
  fetchTaskId?: string
}

export function useSubscription(
  initialIds: Set<string>,
  initialHandles: string[],
  user: User | null,
  onNeedAuth: () => void,
  onMutateSuccess?: (payload: SubscriptionMutateSuccessPayload) => void | Promise<void>
) {
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(initialIds)
  const [subscribedHandles, setSubscribedHandles] = useState<Set<string>>(
    () => new Set(initialHandles.map(normalizeHandle).filter(Boolean))
  )
  const onSuccessRef = useRef(onMutateSuccess)
  useEffect(() => {
    onSuccessRef.current = onMutateSuccess
  }, [onMutateSuccess])

  const initialIdsKey = useMemo(() => [...initialIds].sort().join('\0'), [initialIds])
  const initialHandlesKey = useMemo(
    () => [...initialHandles].map(normalizeHandle).filter(Boolean).sort().join('\0'),
    [initialHandles]
  )

  useEffect(() => {
    setSubscribedIds(new Set(initialIdsKey ? initialIdsKey.split('\0') : []))
  }, [initialIdsKey])

  useEffect(() => {
    setSubscribedHandles(new Set(initialHandlesKey ? initialHandlesKey.split('\0') : []))
  }, [initialHandlesKey])

  const subscribeSource = useCallback(
    async (sourceId: string, sourceHandle: string): Promise<SubscribeSourceResult> => {
      if (!user) {
        onNeedAuth()
        return { ok: false }
      }

      const normHandle = normalizeHandle(sourceHandle)
      if (!sourceId || !normHandle) return { ok: false }

      if (subscribedIds.has(sourceId) || subscribedHandles.has(normHandle)) {
        return { ok: true }
      }

      setSubscribedIds((prev) => new Set(prev).add(sourceId))
      setSubscribedHandles((prev) => new Set(prev).add(normHandle))

      try {
        const res = await fetch('/api/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ source_id: sourceId, source_handle: sourceHandle }),
        })
        const data = (await res.json()) as {
          success?: boolean
          sourceId?: string
          taskId?: string | null
          error?: string
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || '订阅失败')
        }

        const resolvedSourceId = data.sourceId || sourceId
        setSubscribedIds((prev) => {
          const next = new Set(prev)
          next.delete(sourceId)
          next.add(resolvedSourceId)
          return next
        })

        await onSuccessRef.current?.({
          action: 'subscribe',
          sourceId,
          sourceHandle,
          resolvedSourceId,
          ...(data.taskId ? { fetchTaskId: data.taskId } : {}),
        })
        return {
          ok: true,
          ...(data.taskId ? { fetchTaskId: data.taskId } : {}),
        }
      } catch (error) {
        console.error('[useSubscription] 订阅失败，回滚状态:', error)
        setSubscribedIds((prev) => {
          const next = new Set(prev)
          next.delete(sourceId)
          return next
        })
        setSubscribedHandles((prev) => {
          const next = new Set(prev)
          next.delete(normHandle)
          return next
        })
        return { ok: false }
      }
    },
    [user, subscribedIds, subscribedHandles, onNeedAuth]
  )

  const toggleSubscription = useCallback(
    async (sourceId: string, sourceHandle: string) => {
      if (!user) {
        onNeedAuth()
        return
      }

      const wasSubscribed = subscribedIds.has(sourceId)
      const normHandle = normalizeHandle(sourceHandle)

      setSubscribedIds((prev) => {
        const next = new Set(prev)
        wasSubscribed ? next.delete(sourceId) : next.add(sourceId)
        return next
      })
      setSubscribedHandles((prev) => {
        const next = new Set(prev)
        wasSubscribed ? next.delete(normHandle) : next.add(normHandle)
        return next
      })

      try {
        let resolvedSourceId = sourceId
        let fetchTaskId: string | undefined

        if (wasSubscribed) {
          const res = await fetch(
            `/api/subscriptions?id=${encodeURIComponent(sourceId)}`,
            { method: 'DELETE', credentials: 'same-origin' }
          )
          if (!res.ok) throw new Error('取消订阅失败')
        } else {
          const res = await fetch('/api/subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ source_id: sourceId, source_handle: sourceHandle }),
          })
          const data = (await res.json()) as {
            success?: boolean
            sourceId?: string
            taskId?: string | null
          }
          if (!res.ok || !data.success) throw new Error('订阅失败')
          resolvedSourceId = data.sourceId || sourceId
          fetchTaskId = data.taskId || undefined
          setSubscribedIds((prev) => {
            const next = new Set(prev)
            next.delete(sourceId)
            next.add(resolvedSourceId)
            return next
          })
        }

        await onSuccessRef.current?.({
          action: wasSubscribed ? 'unsubscribe' : 'subscribe',
          sourceId,
          sourceHandle,
          ...(!wasSubscribed ? { resolvedSourceId } : {}),
          ...(fetchTaskId ? { fetchTaskId } : {}),
        })
      } catch (error) {
        console.error('[useSubscription] 同步失败，回滚状态:', error)
        setSubscribedIds((prev) => {
          const next = new Set(prev)
          wasSubscribed ? next.add(sourceId) : next.delete(sourceId)
          return next
        })
        setSubscribedHandles((prev) => {
          const next = new Set(prev)
          wasSubscribed ? next.add(normHandle) : next.delete(normHandle)
          return next
        })
      }
    },
    [user, subscribedIds, onNeedAuth]
  )

  return { subscribedIds, subscribedHandles, subscribeSource, toggleSubscription }
}
