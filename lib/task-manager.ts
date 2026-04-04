/**
 * 任务管理器 - 轻量级内存任务队列
 * 用于管理长时间运行的后台任务（如推文抓取）
 */

// 任务状态
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

// 任务信息
export interface Task {
  id: string;
  status: TaskStatus;
  progress: number; // 0-100
  message: string;
  result?: {
    totalPosts?: number;
    processedPosts?: number;
  };
  error?: string;
  createdAt: number;
  updatedAt: number;
  startTime?: number;         // 任务开始时间（毫秒）
  estimatedDuration?: number; // 预计总耗时（秒）
  remainingTime?: number;     // 剩余时间（秒）
}

/**
 * 任务管理器类
 * 使用内存 Map 存储任务状态，自动清理过期任务
 */
class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // 每 10 分钟清理 1 小时前的任务
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldTasks();
    }, 10 * 60 * 1000);
  }

  /**
   * 创建新任务
   * @returns 任务 ID
   */
  createTask(): string {
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.tasks.set(id, {
      id,
      status: 'pending',
      progress: 0,
      message: '准备开始抓取...',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return id;
  }

  /**
   * 更新任务状态
   * @param id 任务 ID
   * @param updates 更新的字段
   */
  updateTask(id: string, updates: Partial<Task>): void {
    const task = this.tasks.get(id);
    if (!task) {
      console.warn(`[TaskManager] Task ${id} not found`);
      return;
    }

    Object.assign(task, updates, { updatedAt: Date.now() });
  }

  /**
   * 获取任务信息
   * @param id 任务 ID
   * @returns 任务信息或 null
   */
  getTask(id: string): Task | null {
    return this.tasks.get(id) || null;
  }

  /**
   * 用户暂停：抓取 / 处理循环内会检测并提前结束（内存态，多实例部署需另方案）
   */
  cancelTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return false;
    }
    Object.assign(task, {
      status: 'cancelled' as TaskStatus,
      message: '已暂停',
      updatedAt: Date.now(),
    });
    return true;
  }

  /**
   * 清理 1 小时前的任务
   */
  private cleanupOldTasks(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    let cleanedCount = 0;

    for (const [id, task] of this.tasks) {
      if (task.updatedAt < oneHourAgo) {
        this.tasks.delete(id);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[TaskManager] Cleaned up ${cleanedCount} old tasks`);
    }
  }

  /**
   * 清理定时器（用于测试或关闭）
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

// 使用全局变量确保真正的单例（避免 Next.js 热重载时重新实例化）
const globalForTaskManager = globalThis as unknown as {
  taskManager: TaskManager | undefined;
};

// 导出单例
export const taskManager = globalForTaskManager.taskManager ?? new TaskManager();

// 保存到全局变量
if (!globalForTaskManager.taskManager) {
  globalForTaskManager.taskManager = taskManager;
}
