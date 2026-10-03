import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { post } from '../fixtures'

const testUrl = process.env.TEST_DATABASE_URL
test('personal hide/restore stays isolated and never republishes shared content', { skip: !testUrl }, async (t) => {
  const url = new URL(testUrl!)
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname))
  assert.equal(url.pathname, '/uai_feature_test', 'Only the disposable test database is allowed')
  process.env.DATABASE_URL = testUrl
  const { pool } = await import('../../lib/db/drizzle')
  const feedback = await import('../../lib/db/pass-logs')
  const a = '00000000-0000-4000-8000-000000000001'
  const b = '00000000-0000-4000-8000-000000000002'
  try {
    await pool.query(await readFile(new URL('../../db/init.sql', import.meta.url), 'utf8'))
    await pool.query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'audit-a@example.invalid', 'unused'), ($2, 'audit-b@example.invalid', 'unused') ON CONFLICT DO NOTHING", [a, b])
    const article = post('feature-test-post', { title: '测试内容：模型推理研究', summary: '仅用于本地自动化回归测试。' })
    await pool.query("INSERT INTO news_items (id, title, source_handle, category, importance_score) VALUES ($1, $2, $3, '研究', 88) ON CONFLICT (id) DO UPDATE SET title=excluded.title", [article.id, article.title, article.source.handle])
    await pool.query('DELETE FROM pass_feedback WHERE user_id = ANY($1::uuid[])', [[a, b]])
    await feedback.recordUserPassedPost(a, article)
    await t.test('subscribing cannot enable a paused source or forge its handle', async () => {
      const sourceId = '00000000-0000-4000-8000-000000000099'
      await pool.query("INSERT INTO sources (id, source_type, platform, handle, name, url, enabled) VALUES ($1, 'blogger', 'X', 'PausedAudit', 'Paused source', 'https://x.com/PausedAudit', false) ON CONFLICT (id) DO UPDATE SET enabled=false", [sourceId])
      const { subscribeUserToSource } = await import('../../lib/services/user-subscriptions-service')
      const { addSourceFromUrlWithBackgroundFetch, startFetchForSubscribedSource } = await import('../../lib/services/sources-service')
      const first = await subscribeUserToSource(b, sourceId, 'forged_handle')
      assert.equal(first.taskId, null)
      await subscribeUserToSource(b, sourceId, 'another_handle')
      const saved = await pool.query('SELECT source_handle FROM user_source_subscriptions WHERE user_id=$1 AND source_id=$2', [b, sourceId])
      assert.equal(saved.rows.length, 1)
      assert.equal(saved.rows[0].source_handle, 'PausedAudit')
      const repeated = await addSourceFromUrlWithBackgroundFetch({ url: 'https://x.com/pausedaudit', user: { id: b } })
      assert.equal(repeated.source.id, sourceId)
      assert.equal(repeated.taskId, undefined)
      assert.equal(repeated.source.enabled, false)
      assert.deepEqual(await startFetchForSubscribedSource(b, sourceId), { ok: false, status: 403, error: '该信息源已由管理员暂停采集' })
      const { taskManager } = await import('../../lib/task-manager-server')
      const { fetchAndProcessPostsInBackground } = await import('../../lib/source-fetch-background')
      const cancelledTask = await taskManager.createTask(b)
      await taskManager.cancelTask(cancelledTask)
      await fetchAndProcessPostsInBackground(repeated.source, cancelledTask, b)
      assert.equal((await taskManager.getTask(cancelledTask))?.status, 'cancelled')
      assert.equal((await pool.query('SELECT enabled FROM sources WHERE id=$1', [sourceId])).rows[0].enabled, false)
    })
    await t.test('task migration works with optional Supabase roles and keeps task data private', async () => {
      await pool.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$; GRANT SELECT ON refresh_tasks TO anon, authenticated")
      await pool.query(await readFile(new URL('../../db/migrations/add-refresh-tasks.sql', import.meta.url), 'utf8'))
      const { rows } = await pool.query("SELECT relrowsecurity, has_table_privilege('anon','refresh_tasks','SELECT') AS anon_read, has_table_privilege('authenticated','refresh_tasks','SELECT') AS member_read FROM pg_class WHERE oid='refresh_tasks'::regclass")
      assert.equal(rows[0].relrowsecurity, true)
      assert.equal(rows[0].anon_read, false)
      assert.equal(rows[0].member_read, false)
    })
    await t.test('task ownership and cancellation survive a fresh persistent manager', async () => {
      const { TaskManager } = await import('../../lib/task-manager')
      const { PostgresTaskStore } = await import('../../lib/db/refresh-tasks')
      const store = new PostgresTaskStore()
      const writer = new TaskManager(store)
      const reader = new TaskManager(new PostgresTaskStore())
      const id = await writer.createTask(b)
      assert.equal((await reader.getTaskForUser(id, b))?.ownerId, b)
      assert.equal(await reader.getTaskForUser(id, a), null)
      await reader.cancelTask(id)
      await writer.updateTask(id, { status: 'completed', message: 'late worker' })
      assert.equal((await reader.getTask(id))?.status, 'cancelled')
      await store.create({ id: 'task-cross-instance-test', ownerId: b, status: 'completed', progress: 100, message: 'isolated fixture', createdAt: Date.now(), updatedAt: Date.now() })
    })
    await t.test('other users cannot see or restore my hidden records', async () => {
      const mine = await feedback.listPassedPosts({ userId: a, handles: ['example'], personalOnly: true })
      const theirs = await feedback.listPassedPosts({ userId: b, handles: ['example'], personalOnly: true })
      assert.equal(mine.length, 1); assert.equal(theirs.length, 0)
      const result = await feedback.promotePassedPosts({ userId: b, ids: [article.id], handles: ['example'], personalOnly: true })
      assert.equal(result.promoted, 0)
    })
    await t.test('restoring clears my hide without rewriting the article or raw queue', async () => {
      const result = await feedback.promotePassedPosts({ userId: a, ids: [article.id], handles: ['example'], personalOnly: true })
      assert.equal(result.promoted, 1)
      assert.deepEqual(await feedback.getUserPassedPostIdsForUser(a), [])
      const saved = await pool.query('SELECT title FROM news_items WHERE id=$1', [article.id])
      assert.equal(saved.rows[0].title, article.title)
      assert.equal((await pool.query('SELECT count(*) FROM raw_posts')).rows[0].count, '0')
    })
    await t.test('hiding again supersedes a previous restore', async () => {
      await feedback.recordUserPassedPost(a, article)
      assert.deepEqual(await feedback.getUserPassedPostIdsForUser(a), [article.id])
      assert.deepEqual(await feedback.getPromotedPassedPostRefsForUser(a), [])
      const rows = await feedback.listPassedPosts({ userId: a, handles: ['example'], personalOnly: true })
      assert.equal(rows[0].promotedAt, null)
    })
    await t.test('retired rules do not consume preference capacity; concurrent windows remain unique', async () => {
      const { createRule, listRules } = await import('../../lib/user-pipeline-rules')
      await pool.query('DELETE FROM user_pipeline_rules WHERE user_id=$1', [a])
      try {
        await pool.query("INSERT INTO user_pipeline_rules (user_id,module,rule_type,payload) SELECT $1,'recommendation','plain_text','{}'::jsonb FROM generate_series(1,40)", [a])
        await Promise.all([1, 2, 3].map((days) => createRule(a, 'recommendation', 'recommendation_visible_days', { days })))
        const rows = await listRules(a, 'recommendation', { strict: true })
        assert.equal(rows.filter((row) => row.ruleType === 'recommendation_visible_days').length, 1)
        assert.equal(rows.filter((row) => row.ruleType === 'plain_text').length, 40)
        const previous = rows.find((row) => row.ruleType === 'recommendation_visible_days')!
        // A legacy over-capacity account must keep its previous window on failure.
        await pool.query("INSERT INTO user_pipeline_rules (user_id,module,rule_type,payload) SELECT $1,'recommendation','hide_if_contains','{\"substring\":\"capacity\"}'::jsonb FROM generate_series(1,40)", [a])
        await assert.rejects(createRule(a, 'recommendation', 'recommendation_visible_days', { days: 7 }), /最多/)
        const after = (await listRules(a, 'recommendation', { strict: true })).find((row) => row.ruleType === 'recommendation_visible_days')!
        assert.equal(after.id, previous.id); assert.deepEqual(after.payload, previous.payload)
      } finally { await pool.query('DELETE FROM user_pipeline_rules WHERE user_id=$1', [a]) }
    })
  } finally { await pool.end() }
})
