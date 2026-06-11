/**
 * 任务管理器 - 轻量级内存任务队列
 * 用于管理长时间运行的后台任务（如推文抓取）
 */

// 任务状态
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** 单次刷新任务在抓取 / 处理各阶段的计数（供面板透明展示） */
export type FetchPipelineTelemetry = {
  /** 从各源 API 拉到的帖/条数（含已与库重复的） */
  rawFetchedTotal?: number;
  /** 因 raw id 或 URL 已在库而跳过写入 */
  rawSkippedDuplicate?: number;
  /** 因当前用户自定义去重/预筛规则跳过写入 raw */
  rawSkippedUserRule?: number;
  /** 本 run 新写入 raw_posts 的条数 */
  rawInserted?: number;
  sourcesProcessed?: number;
  sourcesTotal?: number;
  /** 用户已订阅但当前抓取开关关闭的源数量 */
  sourcesSkippedDisabled?: number;
  /** 进入 AI 处理路径的条数（含低信号/不重要/错误） */
  processAttempted?: number;
  /** 成功写入 news_items */
  processSuccess?: number;
  droppedLowSignal?: number;
  droppedUnimportant?: number;
  processErrors?: number;
  /** 处理阶段非重要错误样例（最多几条） */
  errorsSample?: string[];
};

// 任务信息
export interface Task {
  id: string;
  status: TaskStatus;
  progress: number; // 0-100
  message: string;
  result?: {
    totalPosts?: number;
    processedPosts?: number;
    pipeline?: FetchPipelineTelemetry;
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
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // 每 10 分钟清理 1 小时前的任务
    const cleanupInterval = setInterval(() => {
      this.cleanupOldTasks();
    }, 10 * 60 * 1000);
    this.cleanupInterval = cleanupInterval;

    const maybeNodeInterval = cleanupInterval as unknown as { unref?: () => void };
    maybeNodeInterval.unref?.();
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

/**
 * 合并刷新流水线的遥测字段（保留 result 上其它键）
 */
export function mergePipelineTelemetryToTask(
  taskId: string,
  patch: Partial<FetchPipelineTelemetry>
): void {
  const task = taskManager.getTask(taskId);
  if (!task) return;
  const prevPipeline = task.result?.pipeline ?? {};
  taskManager.updateTask(taskId, {
    result: {
      ...task.result,
      pipeline: { ...prevPipeline, ...patch },
    },
  });
}
