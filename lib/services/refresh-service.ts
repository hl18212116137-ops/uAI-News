import 'server-only'

import { revalidateHomeSourceCaches } from '@/lib/home-cache-invalidation'
import { runRefreshFetchFromEnabledSources } from '@/lib/services/ingest-service'
import {
  PROCESS_RAW_BATCH_LIMIT,
  runRefreshProcessRawQueue,
} from '@/lib/services/process-service'
import { taskManager } from '@/lib/task-manager-server'

export type StartRefreshResult =
  | { ok: true; taskId: string; message: string }
  | { ok: false; error: string }

function messageFromUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  if (typeof error === 'string' && error.trim()) return error
  return '未知错误'
}

const PROCESS_DRAIN_MAX_PASSES = 5

/** Persist the task before returning its id to the client. */
export async function startBackgroundFullRefresh(userId: string): Promise<StartRefreshResult> {
  try {
    const taskId = await taskManager.createTask()
    await taskManager.updateTask(taskId, {
      status: 'running',
      progress: 0,
      message: '正在抓取推文...',
      startTime: Date.now(),
      estimatedDuration: 120,
      remainingTime: 120,
    })

    return { ok: true, taskId, message: '抓取任务已启动' }
  } catch (error: unknown) {
    const message = messageFromUnknownError(error)
    console.error('[Refresh API] 创建任务失败:', error)
    return { ok: false, error: message }
  }
}

/** Run from Next.js after(), so Vercel keeps the invocation alive after the response. */
export async function runBackgroundFullRefresh(taskId: string, userId: string): Promise<void> {
  try {
    const fetchData = await runRefreshFetchFromEnabledSources({
      taskId,
      userId,
      completeTaskAfterFetch: false,
    })

    if ((await taskManager.getTask(taskId))?.status === 'cancelled') return

    let processedTotal = 0
    let reachedDrainLimit = false

    for (let pass = 1; pass <= PROCESS_DRAIN_MAX_PASSES; pass += 1) {
      const processData = await runRefreshProcessRawQueue({
        taskId,
        userId,
        rawLimit: PROCESS_RAW_BATCH_LIMIT,
        rawIds: fetchData.rawIds,
      })
      const processedThisPass = processData.count || 0
      processedTotal += processedThisPass

      if ((await taskManager.getTask(taskId))?.status === 'cancelled') return

      if (processedThisPass < PROCESS_RAW_BATCH_LIMIT) {
        reachedDrainLimit = false
        break
      }

      reachedDrainLimit = pass === PROCESS_DRAIN_MAX_PASSES
      if (reachedDrainLimit) break

      await taskManager.updateTask(taskId, {
        status: 'running',
        progress: 95,
        message: `已处理 ${processedTotal} 条推文，继续清理剩余队列...`,
      })
    }

    if ((await taskManager.getTask(taskId))?.status === 'cancelled') return

    if (fetchData.count > 0 || processedTotal > 0) {
      revalidateHomeSourceCaches()
    }

    await taskManager.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      remainingTime: 0,
      message: reachedDrainLimit
        ? `完成！本轮处理 ${processedTotal} 条新内容，历史队列将在下次继续处理`
        : `完成！共处理 ${processedTotal} 条新内容`,
    })
  } catch (error: unknown) {
    if ((await taskManager.getTask(taskId))?.status === 'cancelled') return

    const message = messageFromUnknownError(error)
    console.error('[Refresh API] 任务失败:', error)
    await taskManager.updateTask(taskId, {
      status: 'failed',
      progress: 0,
      remainingTime: 0,
      message: '抓取失败',
      error: message,
    })
  }
}
