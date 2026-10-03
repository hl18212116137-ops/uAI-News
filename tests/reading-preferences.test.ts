import test from 'node:test'
import assert from 'node:assert/strict'
import { readingPreferenceSchema } from '../lib/reading-preferences'
import { getStatsFromSubscribedFeed, getStatsFromSourceListAndPostCounts } from '../lib/stats'
import { post } from './fixtures'

test('only executable preferences are accepted; retired rule edits are rejected', () => {
  for (const ruleType of ['plain_rule', 'disable_builtin_rule', 'unknown']) {
    assert.equal(readingPreferenceSchema.safeParse({ module: 'recommendation', ruleType, payload: { text: 'anything', ruleId: 'dedupe' } }).success, false)
  }
  assert.equal(readingPreferenceSchema.safeParse({ module: 'ai', ruleType: 'hide_if_contains', payload: { substring: 'ads' } }).success, false)
  assert.deepEqual(readingPreferenceSchema.parse({ module: 'recommendation', ruleType: 'hide_if_contains', payload: { substring: '  ads  ' } }).payload, { substring: 'ads' })
  for (const days of [0, -1, 2.5, 366]) {
    assert.equal(readingPreferenceSchema.safeParse({ module: 'recommendation', ruleType: 'recommendation_visible_days', payload: { days } }).success, false)
  }
})

test('source statistics count every source type and use a rolling 24-hour window', () => {
  const sources = [{ sourceType: 'blogger' }, { sourceType: 'media' }, { sourceType: 'academic' }]
  const stats = getStatsFromSubscribedFeed([
    post('recent', { createdAt: new Date().toISOString() }),
    post('old', { createdAt: new Date(Date.now() - 25 * 3600_000).toISOString() }),
  ], sources)
  assert.deepEqual(stats, { sourceCount: 3, recentPosts: 1 })
  assert.deepEqual(getStatsFromSourceListAndPostCounts([{ enabled: true }, { enabled: false }], 4), { sourceCount: 1, recentPosts: 4 })
})
