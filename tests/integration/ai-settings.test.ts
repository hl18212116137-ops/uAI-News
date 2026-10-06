import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { aiSettingsInputSchema, publicAISettings, type AISettingsInput } from '../../lib/ai/config'

const testUrl = process.env.TEST_DATABASE_URL

test('AI configuration persists encrypted keys and the live factory uses saved settings', { skip: !testUrl }, async (t) => {
  const url = new URL(testUrl!)
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname))
  assert.equal(url.pathname, '/uai_feature_test')
  process.env.DATABASE_URL = testUrl
  process.env.AI_SETTINGS_ENCRYPTION_KEY = 'isolated-ai-configuration-secret-32-characters'
  const { pool } = await import('../../lib/db/drizzle')
  const { saveAISettings, readAISettings, resetAISettings } = await import('../../lib/ai/settings')
  const input: AISettingsInput = { provider: 'deepseek', fallbackProvider: null, model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/chat/completions', timeoutSeconds: 30, apiKey: 'isolated-deepseek-key' }
  const originalFetch = globalThis.fetch
  try {
    await pool.query(await readFile(new URL('../../db/migrations/add-ai-settings.sql', import.meta.url), 'utf8'))
    await resetAISettings()
    await t.test('saved key is encrypted at rest and omitted from admin JSON', async () => {
      await saveAISettings(aiSettingsInputSchema.parse(input))
      const stored = (await pool.query('SELECT encrypted FROM site_ai_settings')).rows[0].encrypted
      assert.ok(!stored.includes(input.apiKey))
      const saved = await readAISettings()
      assert.equal(saved?.connections.deepseek?.apiKey, input.apiKey)
      assert.ok(!JSON.stringify(publicAISettings(saved)).includes(input.apiKey!))
      const { rows } = await pool.query("SELECT relrowsecurity, has_table_privilege('anon','site_ai_settings','SELECT') AS anon_read, has_table_privilege('authenticated','site_ai_settings','SELECT') AS member_read FROM pg_class WHERE oid='site_ai_settings'::regclass")
      assert.equal(rows[0].relrowsecurity, true)
      assert.equal(rows[0].anon_read, false)
      assert.equal(rows[0].member_read, false)
    })
    await t.test('concurrent provider edits preserve both credentials', async () => {
      await Promise.all([
        saveAISettings({ ...input, apiKey: undefined, model: 'deepseek-reasoner' }),
        saveAISettings({ ...input, provider: 'minimax', model: 'MiniMax-M2.7', endpoint: 'https://api.minimax.io/v1/chat/completions', apiKey: 'isolated-minimax-key' }),
      ])
      const saved = await readAISettings()
      assert.equal(saved?.connections.deepseek?.apiKey, 'isolated-deepseek-key')
      assert.equal(saved?.connections.deepseek?.model, 'deepseek-reasoner')
      assert.equal(saved?.connections.minimax?.apiKey, 'isolated-minimax-key')
    })
    await t.test('newly created runtime service uses saved endpoint, model and key', async () => {
      await saveAISettings({ ...input, apiKey: undefined })
      globalThis.fetch = async (target, options) => {
        assert.equal(String(target), input.endpoint)
        assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer isolated-deepseek-key')
        assert.equal(JSON.parse(String(options?.body)).model, 'deepseek-chat')
        return Response.json({ choices: [{ message: { content: '这是中文译文。' } }] })
      }
      const { getDefaultAIService } = await import('../../lib/ai/ai-factory')
      assert.match(await (await getDefaultAIService()).translateContent('hello'), /中文/)
    })
    await t.test('completed rows update progress while a slower row is still waiting', async () => {
      const ids = ['ai-progress-slow', 'ai-progress-fast']
      const { taskManager } = await import('../../lib/task-manager-server')
      const { runRefreshProcessRawQueue } = await import('../../lib/services/process-service')
      const taskId = await taskManager.createTask()
      await pool.query("INSERT INTO raw_posts (id, content, url) VALUES ($1, 'slow-raw meaningful source text for testing', 'https://x.com/audit/status/1'), ($2, 'fast-raw meaningful source text for testing', 'https://x.com/audit/status/2') ON CONFLICT (id) DO UPDATE SET status='new'", ids)
      let release!: () => void
      const slow = new Promise<void>((resolve) => { release = resolve })
      globalThis.fetch = async (_target, options) => {
        if (String(options?.body).includes('slow-raw')) await slow
        return Response.json({ choices: [{ message: { content: '{"important":false,"title":"测试标题","summary":"测试摘要","category":"行业"}' } }] })
      }
      const processing = runRefreshProcessRawQueue({ taskId, rawIds: ids, completeTaskAfterProcess: false })
      try {
        let task
        for (let attempt = 0; attempt < 100; attempt++) {
          task = await taskManager.getTask(taskId)
          if (task?.result?.pipeline?.processAttempted === 1) break
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        assert.equal(task?.result?.pipeline?.processAttempted, 1)
        assert.equal(task?.status, 'running')
        assert.match(task?.message ?? '', /1\/2/)
      } finally { release(); await processing }
      const completedPass = await taskManager.getTask(taskId)
      assert.equal(completedPass?.result?.pipeline?.processAttempted, 2)
      assert.equal(completedPass?.status, 'running', 'Full refresh, not a processing pass, owns completion')
      assert.equal(completedPass?.progress, 95)
    })
    await t.test('resetting settings restores deployment configuration', async () => {
      await resetAISettings()
      assert.equal(await readAISettings(), null)
      assert.equal(publicAISettings(null).source, 'env')
    })
  } finally { globalThis.fetch = originalFetch; await resetAISettings(); await pool.end() }
})
