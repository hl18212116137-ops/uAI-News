import 'server-only'

import { and, eq, gte, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/drizzle'
import { newsItems, sources } from '@/lib/db/schema'
import { expandHandleQueryVariants } from '@/lib/source-avatar'
import { getFeedPublishedAtGte } from '@/lib/feed-window'
import { getSourceById } from '@/lib/sources'
import { fetchAndProcessPostsInBackground } from '@/lib/source-fetch-background'
import { taskManager } from '@/lib/task-manager-server'

/** 同一 handle 自动补抓冷却（毫秒） */
const AUTO_FETCH_COOLDOWN_MS = 30 * 60 * 1000

type ScheduledFetch = {
  scheduledAt: number
  taskId?: string
}

const lastScheduledFetch = new Map<string, ScheduledFetch>()

function normalizeHandle(handle: string): string {
  return String(handle ?? '').trim().replace(/^@+/, '').toLowerCase()
}

/**
 * 对近期 feed 窗口内无帖的 handle 后台触发 X 抓取 + AI 中文处理。
 * 无需登录；依赖 TWITTERAPI_IO_KEY 与 AI 密钥。
 */
export function scheduleStaleSourceFetches(handles: string[]): void {
  const apiKey = process.env.TWITTERAPI_IO_KEY?.trim()
  if (!apiKey) return

  const normalized = [...new Set(handles.map(normalizeHandle).filter(Boolean))]
  if (normalized.length === 0) return

  void (async () => {
    try {
      const feedSince = getFeedPublishedAtGte()
      const countRows = await db
        .select({ sourceHandle: newsItems.sourceHandle })
        .from(newsItems)
        .where(
          and(
            inArray(newsItems.sourceHandle, expandHandleQueryVariants(normalized)),
            gte(newsItems.publishedAt, feedSince)
          )
        )

      const countByHandle = new Map<string, number>()
      for (const row of countRows) {
        const h = normalizeHandle(String(row.sourceHandle ?? ''))
        if (!h) continue
        countByHandle.set(h, (countByHandle.get(h) ?? 0) + 1)
      }

      const stale = normalized.filter((h) => (countByHandle.get(h) ?? 0) === 0)
      if (stale.length === 0) return

      const sourceRows = await db
        .select({ id: sources.id, handle: sources.handle, enabled: sources.enabled })
        .from(sources)
        .where(
          and(
            eq(sources.enabled, true),
            inArray(sources.handle, expandHandleQueryVariants(stale))
          )
        )

      for (const row of sourceRows) {
        const h = normalizeHandle(row.handle)
        if (!h) continue

        const recent = lastScheduledFetch.get(h)
        if (recent && Date.now() - recent.scheduledAt < AUTO_FETCH_COOLDOWN_MS) continue
        const scheduledAt = Date.now()
        lastScheduledFetch.set(h, { scheduledAt })

        const source = await getSourceById(String(row.id))
        if (!source?.enabled) {
          if (lastScheduledFetch.get(h)?.scheduledAt === scheduledAt) {
            lastScheduledFetch.delete(h)
          }
          continue
        }

        const taskId = await taskManager.createTask()
        lastScheduledFetch.set(h, { scheduledAt, taskId })
        await taskManager.updateTask(taskId, {
          status: 'running',
          progress: 0,
          message: `自动抓取 @${source.handle}…`,
          startTime: Date.now(),
        })

        void fetchAndProcessPostsInBackground(source, taskId).catch(async (error) => {
          console.error(`[feed-stale-fetch] @${source.handle} 失败:`, error)
          await taskManager.updateTask(taskId, {
            status: 'failed',
            error: error instanceof Error ? error.message : '抓取失败',
          })
        })
      }
    } catch (error) {
      console.error('[feed-stale-fetch] schedule failed:', error)
    }
  })()
}

/** 订阅单源后立即补抓，并将 taskId 返回给客户端轮询。 */
export async function scheduleStaleSourceFetchesForSourceId(
  sourceId: string,
  sourceHandle: string
): Promise<string | null> {
  if (!process.env.TWITTERAPI_IO_KEY?.trim()) return null
  const handle = normalizeHandle(sourceHandle)
  if (!handle) return null

  let reservationAt: number | null = null
  try {
    const source = await getSourceById(sourceId)
    if (!source?.enabled) return null

    const recent = lastScheduledFetch.get(handle)
    if (recent && Date.now() - recent.scheduledAt < AUTO_FETCH_COOLDOWN_MS) {
      return recent.taskId ?? null
    }
    reservationAt = Date.now()
    lastScheduledFetch.set(handle, { scheduledAt: reservationAt })

    const taskId = await taskManager.createTask()
    lastScheduledFetch.set(handle, { scheduledAt: reservationAt, taskId })
    await taskManager.updateTask(taskId, {
      status: 'running',
      progress: 0,
      message: `订阅后抓取 @${source.handle}…`,
      startTime: Date.now(),
    })

    void fetchAndProcessPostsInBackground(source, taskId).catch(async (error) => {
      console.error(`[feed-stale-fetch] subscribe @${source.handle} 失败:`, error)
      await taskManager.updateTask(taskId, {
        status: 'failed',
        error: error instanceof Error ? error.message : '抓取失败',
      })
    })
    return taskId
  } catch (error) {
    if (
      reservationAt != null &&
      lastScheduledFetch.get(handle)?.scheduledAt === reservationAt &&
      !lastScheduledFetch.get(handle)?.taskId
    ) {
      lastScheduledFetch.delete(handle)
    }
    console.error('[feed-stale-fetch] subscribe schedule failed:', error)
    return null
  }
}
