import test from 'node:test'
import assert from 'node:assert/strict'
import { createFailedTaskFromPolling, readTaskStatusResponse } from '../lib/task-status-client'

test('a missing server-side task becomes a terminal client result', async () => {
  const response = new Response(JSON.stringify({ error: 'Task not found' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  })

  const result = await readTaskStatusResponse(response)

  assert.deepEqual(result, {
    kind: 'missing',
    message: 'Task not found',
  })
})

test('a successful task response returns the task payload', async () => {
  const task = {
    id: 'task_123',
    status: 'completed',
    progress: 100,
    message: '完成',
    createdAt: 1,
    updatedAt: 2,
  }
  const response = Response.json({ task })

  const result = await readTaskStatusResponse(response)

  assert.deepEqual(result, { kind: 'task', task })
})

test('a polling failure produces a terminal, retryable task state', () => {
  const task = createFailedTaskFromPolling('task_123', null, '任务状态已丢失，请重新抓取')

  assert.equal(task.id, 'task_123')
  assert.equal(task.status, 'failed')
  assert.equal(task.progress, 0)
  assert.equal(task.remainingTime, 0)
  assert.equal(task.error, '任务状态已丢失，请重新抓取')
})
