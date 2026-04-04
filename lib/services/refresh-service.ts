import 'server-only'

import { runRefreshFetchFromEnabledSources } from '@/lib/services/ingest-service'
import { runRefreshProcessRawQueue } from '@/lib/services/process-service'
import { taskManager } from '@/lib/task-manager'

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

/**
 * 创建任务并异步串联 fetch → process（与 POST /api/refresh 行为一致，直接调服务层）
 * @param userId 当前登录用户；抓取仅包含其订阅源（由 ingest-service 过滤）
 */
export function startBackgroundFullRefresh(_request: Request, userId: string): StartRefreshResult {
  try {
    console.log('[Refresh API] 创建抓取任务...')

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
        const fetchData = await runRefreshFetchFromEnabledSources({ taskId, userId })
        console.log(`[Refresh API] 抓取完成：${fetchData.count} 条新推文`)

        if (taskManager.getTask(taskId)?.status === 'cancelled') {
          return
        }

        taskManager.updateTask(taskId, {
          progress: 40,
          message: '正在 AI 处理推文...',
        })

        const processData = await runRefreshProcessRawQueue({ taskId })
        console.log(`[Refresh API] 处理完成：${processData.count} 条`)

        if (taskManager.getTask(taskId)?.status === 'cancelled') {
          return
        }

        taskManager.updateTask(taskId, {
          status: 'completed',
          progress: 100,
          message: `完成！共处理 ${processData.count || 0} 条新内容`,
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

    console.log(`[Refresh API] 任务已启动，ID: ${taskId}`)

    return { ok: true, taskId, message: '抓取任务已启动' }
  } catch (error: unknown) {
    const message = messageFromUnknownError(error)
    console.error('[Refresh API] 创建任务失败:', error)
    return { ok: false, error: message }
  }
}
