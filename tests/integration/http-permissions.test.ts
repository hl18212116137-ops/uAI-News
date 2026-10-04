import test from 'node:test'
import assert from 'node:assert/strict'
import { encode } from 'next-auth/jwt'

const base = process.env.TEST_BASE_URL
const secret = process.env.TEST_AUTH_SECRET

test('HTTP permission boundaries and reading preference persistence', { skip: !base || !secret }, async (t) => {
  assert.equal(base, 'http://127.0.0.1:3104', 'Only the isolated verification server is allowed')
  const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']
  const [admin, member] = await Promise.all(ids.map((id, index) => encode({ secret: secret!, token: { id, email: `audit-${index === 0 ? 'a' : 'b'}@example.invalid`, name: '本地验证用户' } })))
  async function request(path: string, method = 'GET', token?: string, body?: unknown) {
    return fetch(`${base}${path}`, { method, redirect: 'manual', headers: {
      ...(token ? { cookie: `next-auth.session-token=${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    }, body: body !== undefined ? JSON.stringify(body) : undefined })
  }
  await t.test('anonymous imports and source creation require authentication', async () => {
    for (const path of ['/api/longform/import', '/api/import-from-url', '/api/longform/from-post', '/api/sources', '/api/refresh/fetch', '/api/refresh/process']) {
      assert.equal((await request(path, 'POST')).status, 401, path)
    }
    const page = await (await request('/admin/pipeline')).text()
    assert.match(page, /NEXT_REDIRECT;replace;\/login\?redirectTo=\/admin\/pipeline;307;/)
    assert.ok(!page.includes('站点采集参数'))
  })
  await t.test('members cannot mutate global sources or access administrative moderation', async () => {
    for (const [path, method] of [
      ['/api/longform/import', 'POST'], ['/api/import-from-url', 'POST'],
      ['/api/sources', 'PATCH'], ['/api/sources', 'DELETE'],
      ['/api/refresh/fetch', 'POST'], ['/api/refresh/process', 'POST'],
      ['/api/me/pass-logs?scope=moderation', 'GET'],
    ]) assert.equal((await request(path, method, member)).status, 403, path)
    assert.equal((await request('/api/me/pass-logs', 'POST', member, { ids: ['feature-test-post'], scope: 'moderation' })).status, 403)
    const denied = await (await request('/admin/pipeline', 'GET', member)).text()
    assert.match(denied, /NEXT_HTTP_ERROR_FALLBACK;404/)
    assert.ok(!denied.includes('站点采集参数'))
    const allowed = await request('/admin/pipeline', 'GET', admin)
    assert.equal(allowed.status, 200)
    assert.match(await allowed.text(), /站点采集参数/)
    const page = await (await request('/admin/pipeline', 'GET', admin)).text()
    assert.match(page, /启用采集/, 'An unsubscribed paused source remains manageable')
  })
  await t.test('refresh status and cancellation belong to the initiating user', async () => {
    assert.equal((await request('/api/task-status?taskId=unknown')).status, 401)
    assert.equal((await request('/api/task-status?taskId=task-cross-instance-test', 'GET', member)).status, 200)
    assert.equal((await request('/api/task-status?taskId=task-cross-instance-test', 'GET', admin)).status, 404)
    const response = await request('/api/refresh', 'POST', member)
    assert.equal(response.status, 200)
    const { taskId } = await response.json()
    assert.ok(taskId)
    assert.equal((await request(`/api/task-status?taskId=${taskId}`, 'GET', member)).status, 200)
    assert.equal((await request(`/api/task-status?taskId=${taskId}`, 'GET', admin)).status, 404)
    assert.equal((await request('/api/refresh/cancel', 'POST', admin, { taskId })).status, 404)
    assert.equal((await request('/api/refresh/cancel', 'POST', member, { taskId })).status, 200)
  })
  await t.test('registration rejects malformed input before touching the database', async () => {
    for (const body of [{}, { email: 'invalid', password: 'long-enough' }, { email: 'reader@example.invalid', password: 'short' }]) {
      assert.equal((await request('/api/register', 'POST', undefined, body)).status, 400)
    }
  })
  await t.test('encoded route parameters and invalid bookmark requests return controlled responses', async () => {
    assert.equal((await request('/api/source-avatar/100%25')).status, 200)
    assert.equal((await request('/api/longform/posts/100%25')).status, 404)
    for (const body of [null, {}, { news_item_id: ' ' }]) {
      assert.equal((await request('/api/bookmarks', 'POST', member, body)).status, 400)
    }
    assert.equal((await request('/api/bookmarks', 'POST', member, { news_item_id: 'nonexistent-audit-id' })).status, 404)
    const response = await fetch(`${base}/api/analysis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null' })
    assert.equal(response.status, 400)
  })
  await t.test('concurrent registration creates one normalized account', async () => {
    const email = `signup-${Date.now()}@example.invalid`
    const responses = await Promise.all([email, email.toUpperCase()].map((value) => request('/api/register', 'POST', undefined, { email: value, password: 'Test-registration-only!', name: '本地注册验证' })))
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409])
    const result = await responses.find((response) => response.status === 200)!.json()
    assert.equal(result.user.email, email)
    assert.ok(result.user.id)
  })
  await t.test('retired rule types are rejected and executable preferences remain user-scoped', async () => {
    assert.equal((await request('/api/me/pipeline-rules', 'POST', member, { module: 'curation', ruleType: 'plain_text', payload: { text: 'ignored' } })).status, 400)
    const saved = await request('/api/me/pipeline-rules', 'POST', member, { module: 'recommendation', ruleType: 'hide_if_contains', payload: { substring: '本地验证关键词' } })
    assert.equal(saved.status, 200)
    const { rule } = await saved.json()
    try {
      const mine = await (await request('/api/me/pipeline-rules', 'GET', member)).json()
      assert.ok(mine.rules.some((item: { id: string }) => item.id === rule.id))
      const theirs = await (await request('/api/me/pipeline-rules', 'GET', admin)).json()
      assert.ok(!theirs.rules.some((item: { id: string }) => item.id === rule.id))
      assert.equal((await request(`/api/me/pipeline-rules?id=${rule.id}`, 'DELETE', admin)).status, 404)
    } finally {
      assert.equal((await request(`/api/me/pipeline-rules?id=${rule.id}`, 'DELETE', member)).status, 200)
    }
  })
  await t.test('bookmarks persist, stay private, and support repeated removal', async () => {
    const postId = 'feature-test-post'
    assert.equal((await request('/api/bookmarks', 'POST', member, { news_item_id: postId })).status, 200)
    assert.equal((await request('/api/bookmarks', 'POST', member, { news_item_id: postId })).status, 200)
    const mine = await (await request('/api/bookmarks', 'GET', member)).json()
    const theirs = await (await request('/api/bookmarks', 'GET', admin)).json()
    assert.equal(mine.bookmarkedIds.filter((id: string) => id === postId).length, 1)
    assert.ok(!theirs.bookmarkedIds.includes(postId))
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal((await request(`/api/bookmarks?id=${postId}`, 'DELETE', member)).status, 200)
    }
    assert.ok(!(await (await request('/api/bookmarks', 'GET', member)).json()).bookmarkedIds.includes(postId))
  })
  await t.test('administrator settings save, validate, and reset', async () => {
    assert.equal((await request('/api/admin/pipeline-settings', 'PUT', member, { rawMinOuterChars: 23 })).status, 403)
    assert.equal((await request('/api/admin/pipeline-settings', 'PUT', admin, { rawMinOuterChars: -1 })).status, 400)
    const saved = await request('/api/admin/pipeline-settings', 'PUT', admin, { rawMinOuterChars: 23 })
    assert.equal(saved.status, 200)
    assert.equal((await saved.json()).config.rawMinOuterChars, 23)
    const reset = await request('/api/admin/pipeline-settings', 'PUT', admin, { rawMinOuterChars: null })
    assert.equal(reset.status, 200)
    assert.notEqual((await reset.json()).config.rawMinOuterChars, 23)
  })
})
