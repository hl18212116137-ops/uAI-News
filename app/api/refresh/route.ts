import { taskManager } from '@/lib/task-manager'
import { requireAuth } from '@/lib/auth'

// 启动两步刷新任务：先抓取，再 AI 处理（需要登录）
export async function POST(request: Request) {
  // 鉴权：未登录返回 401
  const { errorResponse } = await requireAuth();
  if (errorResponse) return errorResponse;

  try {
    console.log('[Refresh API] 创建抓取任务...')

    // 创建任务
    const taskId = taskManager.createTask()

    // 获取当前请求的 origin（用于内部调用）
    const origin = request.headers.get('origin') ||
      `http://localhost:${process.env.PORT || 3000}`

    taskManager.updateTask(taskId, {
      status: 'running',
      progress: 0,
      message: '正在抓取推文...',
      startTime: Date.now(),
      estimatedDuration: 120,
      remainingTime: 120,
    })

    // 异步执行两步流程（不阻塞响应）
    ;(async () => {
      try {
        // 第一步：抓取推文
        const fetchRes = await fetch(`${origin}/api/refresh/fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId }),
        })

        if (!fetchRes.ok) {
          throw new Error('抓取推文失败')
        }

        const fetchData = await fetchRes.json()
        console.log(`[Refresh API] 抓取完成：${fetchData.count} 条新推文`)

        // 第二步：AI 处理
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

        taskManager.updateTask(taskId, {
          status: 'completed',
          progress: 100,
          message: `完成！共处理 ${processData.count || 0} 条新内容`,
        })
      } catch (error: any) {
        console.error('[Refresh API] 任务失败:', error)
        taskManager.updateTask(taskId, {
          status: 'failed',
          progress: 0,
          message: '刷新失败',
          error: error.message || '未知错误',
        })
      }
    })()

    console.log(`[Refresh API] 任务已启动，ID: ${taskId}`)

    // 立即返回任务 ID
    return Response.json({
      success: true,
      taskId,
      message: '抓取任务已启动',
    })
  } catch (error: any) {
    console.error('[Refresh API] 创建任务失败:', error)
    return Response.json(
      {
        success: false,
        error: error.message || '创建任务失败',
      },
      { status: 500 }
    )
  }
}
