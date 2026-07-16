import type { Task } from '@/lib/task-manager'

export type TaskStatusResponse =
  | { kind: 'task'; task: Task }
  | { kind: 'missing'; message: string }
  | { kind: 'error'; message: string }

type TaskStatusPayload = {
  task?: Task | null
  error?: string
}

export function createFailedTaskFromPolling(
  taskId: string,
  currentTask: Task | null,
  error: string
): Task {
  const now = Date.now()
  return {
    ...(currentTask ?? {
      id: taskId,
      createdAt: now,
      startTime: now,
    }),
    id: taskId,
    status: 'failed',
    progress: 0,
    message: '抓取任务中断',
    error,
    remainingTime: 0,
    updatedAt: now,
  }
}

export async function readTaskStatusResponse(response: Response): Promise<TaskStatusResponse> {
  let payload: TaskStatusPayload = {}
  try {
    payload = (await response.json()) as TaskStatusPayload
  } catch {
    // A malformed response is handled as a terminal polling error below.
  }

  if (response.status === 404) {
    return {
      kind: 'missing',
      message: payload.error || 'Task not found',
    }
  }

  if (!response.ok) {
    return {
      kind: 'error',
      message: payload.error || `Task status request failed (${response.status})`,
    }
  }

  if (!payload.task) {
    return {
      kind: 'error',
      message: 'Task status response is missing task data',
    }
  }

  return { kind: 'task', task: payload.task }
}
