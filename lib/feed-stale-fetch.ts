import 'server-only'
import { after } from 'next/server'

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

/** 订阅单源后立即补抓，并将 taskId 返回给客户端轮询。 */
export async function scheduleStaleSourceFetchesForSourceId(
  sourceId: string,
  sourceHandle: string,
  userId: string
): Promise<string | null> {
  if (!process.env.TWITTERAPI_IO_KEY?.trim()) return null
  const handle = normalizeHandle(sourceHandle)
  if (!handle) return null

  let reservationAt: number | null = null
  try {
    const source = await getSourceById(sourceId)
    if (!source?.enabled || source.platform !== 'X') return null

    const recent = lastScheduledFetch.get(handle)
    if (recent && Date.now() - recent.scheduledAt < AUTO_FETCH_COOLDOWN_MS) {
      return recent.taskId && (await taskManager.getTaskForUser(recent.taskId, userId)) ? recent.taskId : null
    }
    reservationAt = Date.now()
    lastScheduledFetch.set(handle, { scheduledAt: reservationAt })

    const taskId = await taskManager.createTask(userId)
    lastScheduledFetch.set(handle, { scheduledAt: reservationAt, taskId })
    await taskManager.updateTask(taskId, {
      status: 'running',
      progress: 0,
      message: `订阅后抓取 @${source.handle}…`,
      startTime: Date.now(),
    })

    after(() => fetchAndProcessPostsInBackground(source, taskId, userId))
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
