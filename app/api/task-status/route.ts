import { taskManager } from '@/lib/task-manager-server';
import { requireAuth } from '@/lib/auth';

export async function GET(request: Request) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse) return errorResponse;
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return Response.json({
        error: 'Missing taskId parameter',
      }, { status: 400 });
    }

    const task = await taskManager.getTaskForUser(taskId, user.id);

    if (!task) {
      return Response.json({
        error: 'Task not found',
      }, { status: 404 });
    }

    // 返回包含 task 的对象
    return Response.json({ task });
  } catch {
    return Response.json({
      error: '任务状态暂时无法读取',
    }, { status: 500 });
  }
}
