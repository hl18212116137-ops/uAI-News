import 'server-only'

import { PostgresTaskStore } from '@/lib/db/refresh-tasks'
import {
  TaskManager,
  type FetchPipelineTelemetry,
} from '@/lib/task-manager'

const globalForTaskManager = globalThis as unknown as {
  persistentTaskManager?: TaskManager
}

export const taskManager =
  globalForTaskManager.persistentTaskManager ?? new TaskManager(new PostgresTaskStore())

if (!globalForTaskManager.persistentTaskManager) {
  globalForTaskManager.persistentTaskManager = taskManager
}

export async function mergePipelineTelemetryToTask(
  taskId: string,
  patch: Partial<FetchPipelineTelemetry>
): Promise<void> {
  const task = await taskManager.getTask(taskId)
  if (!task) return
  const prevPipeline = task.result?.pipeline ?? {}
  await taskManager.updateTask(taskId, {
    result: {
      ...task.result,
      pipeline: { ...prevPipeline, ...patch },
    },
  })
}
