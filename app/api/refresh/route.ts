import { taskManager } from '@/lib/task-manager';
import { backgroundWorker } from '@/lib/background-worker';

// 启动异步抓取任务
export async function POST() {
  try {
    console.log("[Refresh API] 创建抓取任务...");

    // 创建任务
    const taskId = taskManager.createTask();

    // 异步执行任务（不等待）
    backgroundWorker.executeFetchTask(taskId).catch(error => {
      console.error('[Refresh API] Task execution failed:', error);
    });

    console.log(`[Refresh API] 任务已启动，ID: ${taskId}`);

    // 立即返回任务 ID
    return Response.json({
      success: true,
      taskId,
      message: '抓取任务已启动',
    });
  } catch (error: any) {
    console.error("[Refresh API] 创建任务失败:", error);
    return Response.json({
      success: false,
      error: error.message || '创建任务失败',
    }, { status: 500 });
  }
}