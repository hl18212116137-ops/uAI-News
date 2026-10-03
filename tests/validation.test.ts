import test from 'node:test'
import assert from 'node:assert/strict'
import { parseXProfileInput } from '../lib/source-input'
import { registrationSchema } from '../lib/registration'
import { TaskManager, MemoryTaskStore } from '../lib/task-manager'
import { filterPostsForPublicFeed } from '../lib/feed-quality'
import { post } from './fixtures'

test('source input canonicalizes supported profiles before requesting external data', () => {
  for (const value of ['@DrJimFan', 'DrJimFan', 'x.com/DrJimFan', 'https://twitter.com/DrJimFan/status/123456?x=1']) {
    assert.deepEqual(parseXProfileInput(value), { handle: 'DrJimFan', url: 'https://x.com/DrJimFan' })
  }
  for (const value of ['', 'https://x.com.evil.test/name', 'https://evil.test/x.com/name', 'https://x.com@evil.test/name', 'https://user@x.com/name', 'file://x.com/name', 'https://x.com:8080/name', 'https://x.com/', '@this_handle_is_too_long', 'https://x.com/bad-name']) {
    assert.throws(() => parseXProfileInput(value), undefined, value)
  }
})

test('registration rejects malformed payloads and bcrypt byte truncation', () => {
  const valid = { email: '  Reader@Example.com ', password: 'test-password', name: ' Reader ' }
  assert.deepEqual(registrationSchema.parse(valid), { email: 'reader@example.com', password: 'test-password', name: 'Reader' })
  for (const value of [null, {}, { ...valid, email: 'not-an-email' }, { ...valid, password: 'short' }, { ...valid, password: '汉'.repeat(25) }, { ...valid, name: 'a'.repeat(81) }]) {
    assert.equal(registrationSchema.safeParse(value).success, false)
  }
  assert.equal(registrationSchema.safeParse({ ...valid, password: '汉'.repeat(24) }).success, true)
})

test('task visibility is limited to its owner, including legacy ownerless tasks', async () => {
  const taskManager = new TaskManager(new MemoryTaskStore())
  const id = await taskManager.createTask('alice')
  assert.equal((await taskManager.getTaskForUser(id, 'alice'))?.id, id)
  assert.equal(await taskManager.getTaskForUser(id, 'bob'), null)
  assert.equal(await taskManager.getTaskForUser(await taskManager.createTask(), 'alice'), null)
  await taskManager.cancelTask(id)
  await taskManager.updateTask(id, { status: 'completed' })
  assert.equal((await taskManager.getTaskForUser(id, 'alice'))?.status, 'cancelled')
})

test('feed never substitutes placeholder articles for an empty database', () => {
  assert.deepEqual(filterPostsForPublicFeed([]), [])
  const real = post('x-123456', { importanceScore: 80 })
  assert.deepEqual(filterPostsForPublicFeed([post('uai-demo-one', { importanceScore: 99 }), post('seed-one', { importanceScore: 99 }), real]), [real])
})
