import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TaskManager,
  type Task,
  type TaskStore,
} from '../lib/task-manager'

class SharedTaskStore implements TaskStore {
  private readonly tasks = new Map<string, Task>()

  async create(task: Task): Promise<void> {
    this.tasks.set(task.id, structuredClone(task))
  }

  async get(taskId: string): Promise<Task | null> {
    const task = this.tasks.get(taskId)
    return task ? structuredClone(task) : null
  }

  async update(taskId: string, updates: Partial<Task>): Promise<Task | null> {
    const task = this.tasks.get(taskId)
    if (!task) return null

    const updated = {
      ...task,
      ...structuredClone(updates),
      updatedAt: Date.now(),
    }
    this.tasks.set(taskId, updated)
    return structuredClone(updated)
  }
}

test('a refresh task remains visible to a fresh manager instance', async () => {
  const sharedStore = new SharedTaskStore()
  const requestInstance = new TaskManager(sharedStore)
  const pollingInstance = new TaskManager(sharedStore)

  const taskId = await requestInstance.createTask()
  await requestInstance.updateTask(taskId, {
    status: 'running',
    message: '正在抓取推文...',
  })

  const task = await pollingInstance.getTask(taskId)

  assert.equal(task?.id, taskId)
  assert.equal(task?.status, 'running')
  assert.equal(task?.message, '正在抓取推文...')
})

test('cancelling a task is visible across manager instances', async () => {
  const sharedStore = new SharedTaskStore()
  const requestInstance = new TaskManager(sharedStore)
  const cancellationInstance = new TaskManager(sharedStore)

  const taskId = await requestInstance.createTask()
  await requestInstance.updateTask(taskId, { status: 'running' })

  assert.equal(await cancellationInstance.cancelTask(taskId), true)
  assert.equal((await requestInstance.getTask(taskId))?.status, 'cancelled')
})
