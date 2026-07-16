import test from 'node:test'
import assert from 'node:assert/strict'
import { AIServiceFactory } from '../lib/ai/ai-factory'

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
