import 'server-only'

import { runRefreshFetchFromEnabledSources } from '@/lib/services/ingest-service'
import {
  PROCESS_RAW_BATCH_LIMIT,
  runRefreshProcessRawQueue,
} from '@/lib/services/process-service'
import { taskManager } from '@/lib/task-manager'
import { revalidateHomeSourceCaches } from '@/lib/home-cache-invalidation'

export type StartRefreshResult =
  | { ok: true; taskId: string; message: string }
  | { ok: false; error: string }

/** Supabase 等库常抛出带 message 字段的非 Error 对象 */
function messageFromUnknownError(e: unknown): string {
  if (e instanceof Error && e.message.trim() !== '') return e.message
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message
    if (typeof m === 'string' && m.trim() !== '') return m
  }
  if (typeof e === 'string' && e.trim() !== '') return e
  return '未知错误'
}

const devLog = (...args: unknown[]) => {
  if (process.env.NODE_ENV === 'development') console.log(...args)
}

const PROCESS_DRAIN_MAX_PASSES = 5

/**
 * 创建任务并异步串联 fetch → process（与 POST /api/refresh 行为一致，直接调服务层）
 * @param userId 当前登录用户；抓取仅包含其订阅源（由 ingest-service 过滤）
 */
export function startBackgroundFullRefresh(_request: Request, userId: string): StartRefreshResult {
  try {
    devLog('[Refresh API] 创建抓取任务...')

    const taskId = taskManager.createTask()

    taskManager.updateTask(taskId, {
      status: 'running',
      progress: 0,
      message: '正在抓取推文...',
      startTime: Date.now(),
      estimatedDuration: 120,
      remainingTime: 120,
    })

    ;(async () => {
      try {
        // 直接调服务层，避免对本机 origin 发 HTTP（易触发 ECONNRESET / 自连接问题）
        const fetchData = await runRefreshFetchFromEnabledSources({
          taskId,
          userId,
          completeTaskAfterFetch: false,
        })
        devLog(`[Refresh API] 抓取完成：${fetchData.count} 条新推文`)

        if (taskManager.getTask(taskId)?.status === 'cancelled') {
          return
        }

        let processedTotal = 0
        let reachedDrainLimit = false

        for (let pass = 1; pass <= PROCESS_DRAIN_MAX_PASSES; pass += 1) {
          const processData = await runRefreshProcessRawQueue({
            taskId,
            userId,
            rawLimit: PROCESS_RAW_BATCH_LIMIT,
          })
          const processedThisPass = processData.count || 0
          processedTotal += processedThisPass

          if (taskManager.getTask(taskId)?.status === 'cancelled') {
            return
          }

          if (processedThisPass < PROCESS_RAW_BATCH_LIMIT) {
            reachedDrainLimit = false
            break
          }

          reachedDrainLimit = pass === PROCESS_DRAIN_MAX_PASSES
          if (reachedDrainLimit) break

          taskManager.updateTask(taskId, {
            status: 'running',
            progress: 95,
            message: `已处理 ${processedTotal} 条推文，继续清理剩余队列...`,
          })
        }
        devLog(`[Refresh API] 处理完成：${processedTotal} 条`)

        if (taskManager.getTask(taskId)?.status === 'cancelled') {
          return
        }

        if (fetchData.count > 0 || processedTotal > 0) {
          revalidateHomeSourceCaches()
        }

        taskManager.updateTask(taskId, {
          status: 'completed',
          progress: 100,
          message: reachedDrainLimit
            ? `完成！本轮处理 ${processedTotal} 条新内容，仍可能有历史队列待下次继续`
            : `完成！共处理 ${processedTotal} 条新内容`,
        })
      } catch (error: unknown) {
        if (taskManager.getTask(taskId)?.status === 'cancelled') {
          return
        }
        const message = messageFromUnknownError(error)
        console.error('[Refresh API] 任务失败:', error)
        taskManager.updateTask(taskId, {
          status: 'failed',
          progress: 0,
          message: '刷新失败',
          error: message,
        })
      }
    })()

    devLog(`[Refresh API] 任务已启动，ID: ${taskId}`)

    return { ok: true, taskId, message: '抓取任务已启动' }
  } catch (error: unknown) {
    const message = messageFromUnknownError(error)
    console.error('[Refresh API] 创建任务失败:', error)
    return { ok: false, error: message }
  }
}
