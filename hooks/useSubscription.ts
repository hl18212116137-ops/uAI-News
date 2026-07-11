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
  onMutateSuccess?: (payload: SubscriptionMutateSuccessPayload) => void | Promise<void>,
) {
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(() => new Set(initialIds))
  const [subscribedHandles, setSubscribedHandles] = useState<Set<string>>(
    () => new Set(initialHandles.map(normalizeHandle).filter(Boolean)),
  )
  const subscribedIdsRef = useRef(subscribedIds)
  const subscribedHandlesRef = useRef(subscribedHandles)
  const pendingKeysRef = useRef(new Set<string>())
  const onSuccessRef = useRef(onMutateSuccess)
  const onNeedAuthRef = useRef(onNeedAuth)

  useEffect(() => {
    onSuccessRef.current = onMutateSuccess
  }, [onMutateSuccess])

  useEffect(() => {
    onNeedAuthRef.current = onNeedAuth
  }, [onNeedAuth])

  const initialIdsKey = useMemo(() => [...initialIds].sort().join('\0'), [initialIds])
  const initialHandlesKey = useMemo(
    () => [...initialHandles].map(normalizeHandle).filter(Boolean).sort().join('\0'),
    [initialHandles],
  )

  const commitSubscribedIds = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    setSubscribedIds((prev) => {
      const next = updater(prev)
      subscribedIdsRef.current = next
      return next
    })
  }, [])

  const commitSubscribedHandles = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    setSubscribedHandles((prev) => {
      const next = updater(prev)
      subscribedHandlesRef.current = next
      return next
    })
  }, [])

  useEffect(() => {
    const next = new Set(initialIdsKey ? initialIdsKey.split('\0') : [])
    subscribedIdsRef.current = next
    setSubscribedIds(next)
  }, [initialIdsKey])

  useEffect(() => {
    const next = new Set(initialHandlesKey ? initialHandlesKey.split('\0') : [])
    subscribedHandlesRef.current = next
    setSubscribedHandles(next)
  }, [initialHandlesKey])

  const markPending = useCallback((key: string, pending: boolean) => {
    if (pending) pendingKeysRef.current.add(key)
    else pendingKeysRef.current.delete(key)
  }, [])

  const subscribeSource = useCallback(
    async (sourceId: string, sourceHandle: string): Promise<SubscribeSourceResult> => {
      if (!user) {
        onNeedAuthRef.current()
        return { ok: false }
      }

      const normHandle = normalizeHandle(sourceHandle)
      if (!sourceId || !normHandle) return { ok: false }
      if (pendingKeysRef.current.has(normHandle)) return { ok: false }
      if (subscribedIdsRef.current.has(sourceId) || subscribedHandlesRef.current.has(normHandle)) {
        return { ok: true }
      }

      markPending(normHandle, true)
      commitSubscribedIds((prev) => new Set(prev).add(sourceId))
      commitSubscribedHandles((prev) => new Set(prev).add(normHandle))

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
        if (!res.ok || !data.success) throw new Error(data.error || '订阅失败')

        const resolvedSourceId = data.sourceId || sourceId
        commitSubscribedIds((prev) => {
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
        commitSubscribedIds((prev) => {
          const next = new Set(prev)
          next.delete(sourceId)
          return next
        })
        commitSubscribedHandles((prev) => {
          const next = new Set(prev)
          next.delete(normHandle)
          return next
        })
        return { ok: false }
      } finally {
        markPending(normHandle, false)
      }
    },
    [commitSubscribedHandles, commitSubscribedIds, markPending, user],
  )

  const toggleSubscription = useCallback(
    async (sourceId: string, sourceHandle: string) => {
      if (!user) {
        onNeedAuthRef.current()
        return
      }

      const normHandle = normalizeHandle(sourceHandle)
      const pendingKey = sourceId || normHandle
      if (!sourceId || !normHandle || pendingKeysRef.current.has(pendingKey)) return

      const wasSubscribed =
        subscribedIdsRef.current.has(sourceId) || subscribedHandlesRef.current.has(normHandle)

      markPending(pendingKey, true)
      commitSubscribedIds((prev) => {
        const next = new Set(prev)
        wasSubscribed ? next.delete(sourceId) : next.add(sourceId)
        return next
      })
      commitSubscribedHandles((prev) => {
        const next = new Set(prev)
        wasSubscribed ? next.delete(normHandle) : next.add(normHandle)
        return next
      })

      try {
        let resolvedSourceId = sourceId
        let fetchTaskId: string | undefined

        if (wasSubscribed) {
          const res = await fetch(`/api/subscriptions?id=${encodeURIComponent(sourceId)}`, {
            method: 'DELETE',
            credentials: 'same-origin',
          })
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
          commitSubscribedIds((prev) => {
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
        commitSubscribedIds((prev) => {
          const next = new Set(prev)
          wasSubscribed ? next.add(sourceId) : next.delete(sourceId)
          return next
        })
        commitSubscribedHandles((prev) => {
          const next = new Set(prev)
          wasSubscribed ? next.add(normHandle) : next.delete(normHandle)
          return next
        })
      } finally {
        markPending(pendingKey, false)
      }
    },
    [commitSubscribedHandles, commitSubscribedIds, markPending, user],
  )

  return { subscribedIds, subscribedHandles, subscribeSource, toggleSubscription }
}
