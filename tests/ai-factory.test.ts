import test from 'node:test'
import assert from 'node:assert/strict'
import { AIServiceFactory } from '../lib/ai/ai-factory'
import { cleanEnvValue } from '../lib/env'

test('removes BOM and surrounding whitespace from environment values', () => {
  assert.equal(cleanEnvValue('\uFEFF  deepseek\r\n'), 'deepseek')
  assert.equal(cleanEnvValue(undefined), '')
})

test('accepts a provider and API key containing deployment whitespace', () => {
  const previousProvider = process.env.AI_PROVIDER
  const previousDeepSeek = process.env.DEEPSEEK_API_KEY

  try {
    process.env.AI_PROVIDER = '\uFEFFdeepseek\r\n'
    process.env.DEEPSEEK_API_KEY = '\uFEFF acceptance-key\r\n'

    const service = AIServiceFactory.create()

    assert.equal(service.getProviderName(), 'deepseek')
  } finally {
    if (previousProvider === undefined) delete process.env.AI_PROVIDER
    else process.env.AI_PROVIDER = previousProvider
    if (previousDeepSeek === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = previousDeepSeek
  }
})

test('uses the configured fallback when the primary provider cannot be constructed', () => {
  const previousDeepSeek = process.env.DEEPSEEK_API_KEY
  const previousMinimax = process.env.MINIMAX_API_KEY

  try {
    delete process.env.DEEPSEEK_API_KEY
    process.env.MINIMAX_API_KEY = 'acceptance-key'

    const service = AIServiceFactory.createWithFallback('deepseek', 'minimax')

    assert.equal(service.getProviderName(), 'minimax')
  } finally {
    if (previousDeepSeek === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = previousDeepSeek
    if (previousMinimax === undefined) delete process.env.MINIMAX_API_KEY
    else process.env.MINIMAX_API_KEY = previousMinimax
  }
})
