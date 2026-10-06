import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { encryptAISettings, decryptAISettings } from '../lib/ai/credentials'
import { aiSettingsInputSchema, mergeAISettings, publicAISettings, resolveAISettings, type AISettingsInput, type AIConnection } from '../lib/ai/config'
import { AIRequestError, requestAIText } from '../lib/ai/request'
import { AIServiceFactory } from '../lib/ai/ai-factory'

const input: AISettingsInput = { provider: 'deepseek', fallbackProvider: null, model: 'deepseek-chat',
  endpoint: 'https://api.deepseek.com/chat/completions', timeoutSeconds: 30, apiKey: 'test-secret-key' }

test('keys are authenticated-encrypted with fresh nonces and never exposed in public settings', () => {
  const saved = mergeAISettings(null, input)
  const secret = 'a'.repeat(32)
  const first = encryptAISettings(saved, secret)
  assert.ok(!first.includes(input.apiKey!))
  assert.notEqual(first, encryptAISettings(saved, secret))
  assert.deepEqual(decryptAISettings(first, secret), saved)
  assert.throws(() => decryptAISettings(first, 'b'.repeat(32)))
  const [version, iv, tag, body] = first.split('.')
  const bytes = Buffer.from(body, 'base64'); bytes[0] ^= 1
  assert.throws(() => decryptAISettings([version, iv, tag, bytes.toString('base64')].join('.'), secret))
  assert.throws(() => encryptAISettings(saved, 'short'))
  assert.ok(!JSON.stringify(publicAISettings(saved)).includes(input.apiKey!))
})

test('provider keys survive switching, blank edits preserve keys, and clearing disables the key', () => {
  let saved = mergeAISettings(null, input)
  saved = mergeAISettings(saved, { ...input, provider: 'minimax', model: 'MiniMax-M2.7', endpoint: 'https://api.minimax.io/v1/chat/completions', apiKey: 'second-key' })
  saved = mergeAISettings(saved, { ...input, apiKey: undefined })
  assert.equal(resolveAISettings(saved).connections.deepseek.apiKey, 'test-secret-key')
  assert.equal(resolveAISettings(saved).connections.minimax.apiKey, 'second-key')
  saved = mergeAISettings(saved, { ...input, apiKey: undefined, clearApiKey: true })
  assert.equal(resolveAISettings(saved).connections.deepseek.apiKey, '')
  assert.equal(publicAISettings(saved).connections.deepseek.configured, false)
})

test('configuration rejects arbitrary endpoints, mismatched providers, and duplicate fallback', () => {
  for (const change of [{ endpoint: 'http://127.0.0.1/internal' }, { endpoint: 'https://attacker.invalid/' },
    { endpoint: 'https://api.anthropic.com/v1/messages' }, { fallbackProvider: 'deepseek' },
    { timeoutSeconds: 0 }, { apiKey: 'key', clearApiKey: true }]) {
    assert.equal(aiSettingsInputSchema.safeParse({ ...input, ...change }).success, false)
  }
  assert.equal(aiSettingsInputSchema.safeParse(input).success, true)
})

test('authentication failure is not retried or hidden behind fallback when disabled', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = async () => { calls++; return new Response('secret-provider-response', { status: 401 }) }
    const connections = resolveAISettings(mergeAISettings(null, input)).connections
    const service = AIServiceFactory.createWithFallback('deepseek', null, connections)
    await assert.rejects(service.processNews('some content', 'name', 'handle'), /API Key 无效/)
    assert.equal(calls, 1)
  } finally { globalThis.fetch = originalFetch }
})

test('permanent primary errors immediately switch to a configured fallback', async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []
  let saved = mergeAISettings(null, input)
  saved = mergeAISettings(saved, { ...input, provider: 'minimax', fallbackProvider: 'deepseek', model: 'MiniMax-M2.7', endpoint: 'https://api.minimax.io/v1/chat/completions', apiKey: 'second-key' })
  try {
    globalThis.fetch = async (url) => {
      calls.push(String(url))
      return String(url).includes('deepseek') ? new Response('', { status: 401 }) : Response.json({ choices: [{ message: { content: '{"important":false,"title":"测试","summary":"测试摘要","category":"行业"}' } }] })
    }
    const service = AIServiceFactory.createWithFallback('deepseek', 'minimax', resolveAISettings(saved).connections)
    assert.equal((await service.processNews('some content', 'name', 'handle')).important, false)
    assert.equal(calls.length, 2)
  } finally { globalThis.fetch = originalFetch }
})

test('slow or stalled response bodies are aborted and expired per-post budgets issue no request', async () => {
  const server = createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.write('{') })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const connection: AIConnection = { ...resolveAISettings(mergeAISettings(null, input)).connections.deepseek,
    endpoint: `http://127.0.0.1:${address.port}`, timeoutSeconds: 0.03 }
  try {
    await assert.rejects(requestAIText(connection, 'test'), /已停止等待/)
    await assert.rejects(requestAIText({ ...connection, deadlineAt: Date.now() - 1 }, 'test'), (error: unknown) => error instanceof AIRequestError && error.status === 408)
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())) }
})

test('provider transport parses Claude blocks, strips MiniMax thinking, and rejects business errors', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(options?.redirect, 'error')
      assert.equal((options?.headers as Record<string, string>)['anthropic-version'], '2023-06-01')
      return Response.json({ content: [{ type: 'text', text: 'OK' }] })
    }
    assert.equal(await requestAIText({ ...resolveAISettings(null).connections.claude, apiKey: 'test' }, 'test'), 'OK')
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '<think>private thinking</think>OK' } }] })
    assert.equal(await requestAIText({ ...resolveAISettings(null).connections.minimax, apiKey: 'test' }, 'test'), 'OK')
    globalThis.fetch = async () => Response.json({ base_resp: { status_code: 1004, status_msg: 'sensitive error' } })
    await assert.rejects(requestAIText({ ...resolveAISettings(null).connections.minimax, apiKey: 'test' }, 'test'), /业务码 1004/)
  } finally { globalThis.fetch = originalFetch }
})
