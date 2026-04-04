import 'server-only'

import { taskManager } from '@/lib/task-manager'

export type StartRefreshResult =
  | { ok: true; taskId: string; message: string }
  | { ok: false; error: string }

/**
 * 创建任务并异步串联 fetch → process（与 POST /api/refresh 行为一致，仍经内部 HTTP）
 * @param userId 当前登录用户；抓取仅包含其订阅源（由 ingest-service 过滤）
 */
export function startBackgroundFullRefresh(request: Request, userId: string): StartRefreshResult {
  try {
    console.log('[Refresh API] 创建抓取任务...')

    const taskId = taskManager.createTask()

    const origin =
      request.headers.get('origin') || `http://localhost:${process.env.PORT || 3000}`

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
        const fetchRes = await fetch(`${origin}/api/refresh/fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, userId }),
        })

        if (!fetchRes.ok) {
          throw new Error('抓取推文失败')
        }

        const fetchData = await fetchRes.json()
        console.log(`[Refresh API] 抓取完成：${fetchData.count} 条新推文`)

        if (taskManager.getTask(taskId)?.status === 'cancelled') {
          return
        }

        taskManager.updateTask(taskId, {
          progress: 40,
          message: '正在 AI 处理推文...',
        })

        const processRes = await fetch(`${origin}/api/refresh/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId }),
        })

        if (!processRes.ok) {
          throw new Error('AI 处理失败')
        }

        const processData = await processRes.json()
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
        const message = error instanceof Error ? error.message : '未知错误'
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
    const message = error instanceof Error ? error.message : '创建任务失败'
    console.error('[Refresh API] 创建任务失败:', error)
    return { ok: false, error: message }
  }
}
