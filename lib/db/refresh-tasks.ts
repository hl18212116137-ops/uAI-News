import 'server-only'

import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/drizzle'
import { refreshTasks } from '@/lib/db/schema'
import { withTransientDatabaseReadRetry } from '@/lib/db/retry'
import type { Task, TaskStore } from '@/lib/task-manager'

function asTask(payload: unknown): Task | null {
  if (!payload || typeof payload !== 'object') return null
  const task = payload as Partial<Task>
  if (typeof task.id !== 'string' || typeof task.status !== 'string') return null
  return task as Task
}

export class PostgresTaskStore implements TaskStore {
  async create(task: Task): Promise<void> {
    await db
      .insert(refreshTasks)
      .values({
        id: task.id,
        status: task.status,
        payload: task,
        createdAt: new Date(task.createdAt),
        updatedAt: new Date(task.updatedAt),
      })
      .onConflictDoNothing({ target: refreshTasks.id })
  }

  async get(taskId: string): Promise<Task | null> {
    return withTransientDatabaseReadRetry(
      async () => {
        const rows = await db
          .select({ payload: refreshTasks.payload })
          .from(refreshTasks)
          .where(eq(refreshTasks.id, taskId))
          .limit(1)
        return asTask(rows[0]?.payload)
      },
      { operationName: 'read refresh task' }
    )
  }

  async update(taskId: string, updates: Partial<Task>): Promise<Task | null> {
    const updatedAt = Date.now()
    const patch = JSON.stringify({ ...updates, updatedAt })
    const rows = await db
      .update(refreshTasks)
      .set({
        ...(updates.status ? { status: updates.status } : {}),
        payload: sql`${refreshTasks.payload} || ${patch}::jsonb`,
        updatedAt: new Date(updatedAt),
      })
      .where(eq(refreshTasks.id, taskId))
      .returning({ payload: refreshTasks.payload })

    return asTask(rows[0]?.payload)
  }
}
