import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchPostsFromX } from '../lib/x'

test('X fetch distinguishes provider failures from a successful empty feed', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.TWITTERAPI_IO_KEY
  process.env.TWITTERAPI_IO_KEY = 'test-key'
  try {
    globalThis.fetch = async () => new Response('{}', { status: 402 })
    await assert.rejects(fetchPostsFromX('OpenAI'), /余额不足/)
    globalThis.fetch = async () => new Response('{}', { status: 503 })
    await assert.rejects(fetchPostsFromX('OpenAI'), /503/)
    globalThis.fetch = async () => { throw new Error('network unavailable') }
    await assert.rejects(fetchPostsFromX('OpenAI'), /network unavailable/)
    globalThis.fetch = async () => Response.json({ data: { tweets: [] } })
    assert.deepEqual(await fetchPostsFromX('OpenAI'), [])
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.TWITTERAPI_IO_KEY
    else process.env.TWITTERAPI_IO_KEY = originalKey
  }
})
