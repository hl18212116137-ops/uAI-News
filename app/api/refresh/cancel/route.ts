import { requireAuth } from '@/lib/auth'
import { taskManager } from '@/lib/task-manager'

/** 暂停当前 FETCH 任务（抓取 / AI 处理循环内会检测 status） */
export async function POST(request: Request) {
  const { errorResponse } = await requireAuth()
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

  const ok = taskManager.cancelTask(taskId)
  return Response.json({ success: ok, cancelled: ok })
}
