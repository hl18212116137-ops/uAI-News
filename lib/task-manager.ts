export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export type FetchPipelineTelemetry = {
  rawFetchedTotal?: number
  rawSkippedDuplicate?: number
  rawSkippedUserRule?: number
  rawInserted?: number
  sourcesProcessed?: number
  sourcesTotal?: number
  sourcesSkippedDisabled?: number
  processAttempted?: number
  processSuccess?: number
  droppedLowSignal?: number
  droppedUnimportant?: number
  processErrors?: number
  errorsSample?: string[]
}

export interface Task {
  id: string
  status: TaskStatus
  progress: number
  message: string
  result?: {
    totalPosts?: number
    processedPosts?: number
    pipeline?: FetchPipelineTelemetry
  }
  error?: string
  createdAt: number
  updatedAt: number
  startTime?: number
  estimatedDuration?: number
  remainingTime?: number
}

export interface TaskStore {
  create(task: Task): Promise<void>
  get(taskId: string): Promise<Task | null>
  update(taskId: string, updates: Partial<Task>): Promise<Task | null>
}

export class TaskManager {
  constructor(private readonly store: TaskStore) {}

  async createTask(): Promise<string> {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    const now = Date.now()
    await this.store.create({
      id,
      status: 'pending',
      progress: 0,
      message: '准备开始抓取...',
      createdAt: now,
      updatedAt: now,
    })
    return id
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const task = await this.store.update(id, updates)
    if (!task) console.warn(`[TaskManager] Task ${id} not found`)
    return task
  }

  getTask(id: string): Promise<Task | null> {
    return this.store.get(id)
  }

  async cancelTask(id: string): Promise<boolean> {
    const task = await this.store.get(id)
    if (!task) return false
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return false
    }

    await this.store.update(id, {
      status: 'cancelled',
      message: '已暂停',
    })
    return true
  }
}

export class MemoryTaskStore implements TaskStore {
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
