import { requireAuth } from '@/lib/auth'
import { taskManager } from '@/lib/task-manager-server'
import { after } from 'next/server'
import {
  runBackgroundFullRefresh,
  startBackgroundFullRefresh,
} from '@/lib/services/refresh-service'

export const maxDuration = 300

// 启动两步刷新任务：先抓取，再 AI 处理（需要登录）
export async function POST() {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const result = await startBackgroundFullRefresh(user.id)

  if (!result.ok) {
    return Response.json(
      {
        success: false,
        error: result.error,
      },
      { status: 500 }
    )
  }

  const task = await taskManager.getTask(result.taskId)
  after(() => runBackgroundFullRefresh(result.taskId, user.id))

  return Response.json({
    success: true,
    taskId: result.taskId,
    message: result.message,
    task,
  })
}
