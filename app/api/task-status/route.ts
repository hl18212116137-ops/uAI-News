import { taskManager } from '@/lib/task-manager';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return Response.json({
        error: 'Missing taskId parameter',
      }, { status: 400 });
    }

    const task = taskManager.getTask(taskId);

    if (!task) {
      return Response.json({
        error: 'Task not found',
      }, { status: 404 });
    }

    // 返回包含 task 的对象
    return Response.json({ task });
  } catch (error: any) {
    return Response.json({
      error: error.message,
    }, { status: 500 });
  }
}
