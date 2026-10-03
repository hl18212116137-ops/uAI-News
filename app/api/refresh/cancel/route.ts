import { requireAuth } from '@/lib/auth'
import { taskManager } from '@/lib/task-manager-server'

/** 暂停当前 FETCH 任务（抓取 / AI 处理循环内会检测 status） */
export async function POST(request: Request) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  let taskId: string | undefined
  try {
    const body = await request.json()
    taskId = typeof body?.taskId === 'string' ? body.taskId : undefined
  } catch {
    /* empty body */
  }

  if (!taskId) {
    return Response.json({ success: false, error: '缺少 taskId' }, { status: 400 })
  }

  if (!(await taskManager.getTaskForUser(taskId, user.id))) {
    return Response.json({ success: false, error: '任务不存在' }, { status: 404 })
  }
  const ok = await taskManager.cancelTask(taskId)
  return Response.json({ success: ok, cancelled: ok })
}
