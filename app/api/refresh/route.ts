import { requireAuth } from '@/lib/auth'
import { taskManager } from '@/lib/task-manager'
import { startBackgroundFullRefresh } from '@/lib/services/refresh-service'

// 启动两步刷新任务：先抓取，再 AI 处理（需要登录）
export async function POST(request: Request) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const result = startBackgroundFullRefresh(request, user.id)

  if (!result.ok) {
    return Response.json(
      {
        success: false,
        error: result.error,
      },
      { status: 500 }
    )
  }

  const task = taskManager.getTask(result.taskId)

  return Response.json({
    success: true,
    taskId: result.taskId,
    message: result.message,
    task,
  })
}
