import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { watchTask } from '../lib/task-polling'
import { response } from './fixtures'
const originalFetch = globalThis.fetch
const stops: (() => void)[] = []
afterEach(() => { stops.splice(0).forEach((stop) => stop()); globalThis.fetch = originalFetch })
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test('a slow task request never overlaps another poll', async () => {
  let calls = 0
  let resolve!: (value: Response) => void
  globalThis.fetch = async () => { calls++; return new Promise((done) => { resolve = done }) }
  const updates: string[] = []
  const stop = watchTask('task-1', (task) => updates.push(task.status), { intervalMs: 1 })
  stops.push(stop)
  await sleep(15)
  assert.equal(calls, 1)
  resolve(response({ task: { id: 'task-1', status: 'completed' } }))
  await sleep(15)
  assert.deepEqual(updates, ['completed']); assert.equal(calls, 1)
})

test('cancel stops pending requests and ignores late responses', async () => {
  let signal: AbortSignal | undefined
  let resolve!: (value: Response) => void
  globalThis.fetch = async (_url, init) => { signal = init?.signal as AbortSignal; return new Promise((done) => { resolve = done }) }
  let calls = 0
  const stop = watchTask('task-2', () => calls++, { intervalMs: 1 })
  stops.push(stop); stop()
  assert.equal(signal?.aborted, true)
  resolve(response({ task: { id: 'task-2', status: 'running' } }))
  await sleep(10); assert.equal(calls, 0)
})

test('expired tasks stop immediately rather than polling forever', async () => {
  let requests = 0
  globalThis.fetch = async () => { requests++; return response({ error: 'Task not found' }, 404) }
  const errors: string[] = []
  stops.push(watchTask('gone', () => {}, { intervalMs: 1, onError: (message) => errors.push(message) }))
  await sleep(15)
  assert.equal(requests, 1); assert.equal(errors.length, 1)
})
