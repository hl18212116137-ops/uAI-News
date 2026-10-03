import test from 'node:test'
import assert from 'node:assert/strict'
import { clampFeedPageLimit, clampFeedPageOffset, filterFeedPosts, makeFilteredFeedPage } from '../lib/feed-pagination'
import { dedupeNewsItemsForDisplay, areNewsItemsNearDuplicate, newsItemDedupeKeys } from '../lib/news-dedupe'
import { getFeedCandidateLimit } from '../lib/feed-limits'
import type { NewsItem } from '../lib/types'
import { post } from './fixtures'
import { sourceHandlesCacheKey, expandHandleQueryVariants } from '../lib/source-avatar'

function referenceDedupe(items: NewsItem[]) {
  const keys = new Set<string>()
  const result: NewsItem[] = []
  for (const item of items) {
    const incoming = newsItemDedupeKeys(item)
    if (incoming.some((key) => keys.has(key)) || result.some((saved) => areNewsItemsNearDuplicate(saved, item))) continue
    result.push(item)
    incoming.forEach((key) => keys.add(key))
  }
  return result
}

test('missing or invalid limits use default page size instead of one', () => {
  for (const value of [null, undefined, '', ' ', NaN, Infinity, 'invalid']) assert.equal(clampFeedPageLimit(value), 12)
  assert.equal(clampFeedPageLimit('100'), 40)
  assert.equal(clampFeedPageLimit('-4'), 1)
  assert.equal(clampFeedPageOffset('-5'), 0)
  assert.equal(clampFeedPageOffset('4.8'), 4)
})

test('filters normalize source handles and search full text before making previews', () => {
  const original = post('one', { content: '前言'.repeat(400) + 'unique needle' })
  const items = [post('two', { category: '政策' }), original]
  const page = makeFilteredFeedPage(items, 0, 12, { sourceHandle: ' @EXAMPLE ', category: '研究', searchQuery: ' NEEDLE ' })
  assert.equal(page.total, 1)
  assert.equal(page.posts[0].id, 'one')
  assert.equal(page.nextOffset, 1)
  assert.equal(page.hasMore, false)
  assert.ok(page.posts[0].content.length <= 420)
  assert.ok(original.content.includes('needle'))
  assert.equal(filterFeedPosts(items).length, 2)
})

test('pagination offsets count consumed results and never mutate input', () => {
  const items = Array.from({ length: 27 }, (_, index) => post(String(index)))
  const a = makeFilteredFeedPage(items, 0, 12)
  const b = makeFilteredFeedPage(items, a.nextOffset, 12)
  const c = makeFilteredFeedPage(items, b.nextOffset, 12)
  assert.equal(new Set([...a.posts, ...b.posts, ...c.posts].map((item) => item.id)).size, 27)
  assert.equal(c.hasMore, false)
  assert.equal(items.length, 27)
})

test('indexed dedupe preserves the previous first-wins algorithm on mixed stories', () => {
  const topics = ['quantum robotics planning', 'transformer inference memory', 'climate vision satellite', 'biology protein folding']
  const items = Array.from({ length: 180 }, (_, index) => post(`item-${index}`, {
    title: index % 7 === 0 ? '独立中文报道' : `${topics[index % topics.length]} experiment${index % 19} token${index % 31}`,
    content: index % 5 === 0 ? 'Shared content fingerprint with enough characters to trigger matching.' : `result${index} metric${index % 9}`,
    publishedAt: index % 17 === 0 ? 'invalid' : new Date(Date.UTC(2026, 9, 1 + index % 12)).toISOString(),
  }))
  items.push(items[0], { ...items[8], id: 'another-id' }, post('unique'))
  assert.deepEqual(dedupeNewsItemsForDisplay(items).map((item) => item.id), referenceDedupe(items).map((item) => item.id))
  assert.deepEqual(dedupeNewsItemsForDisplay([...items].reverse()).map((item) => item.id), referenceDedupe([...items].reverse()).map((item) => item.id))
})

test('dedupe keeps distant events and merges equivalent X status identities', () => {
  const a = post('x_123456', { source: { platform: 'X', name: 'A', handle: 'a', url: 'https://twitter.com/a/status/123456' } })
  assert.equal(dedupeNewsItemsForDisplay([a, { ...a, id: 'x-123456' }]).length, 1)
  const b = post('a', { title: 'quantum robotics planning research' })
  const c = post('b', { title: 'quantum robotics planning breakthrough', publishedAt: '2026-09-01T00:00:00Z' })
  assert.equal(dedupeNewsItemsForDisplay([b, c]).length, 2)
})

test('candidate window remains bounded for invalid configuration', () => {
  const previous = process.env.FEED_CANDIDATE_LIMIT
  try {
    process.env.FEED_CANDIDATE_LIMIT = 'bad'; assert.equal(getFeedCandidateLimit(), 1000)
    process.env.FEED_CANDIDATE_LIMIT = '100000'; assert.equal(getFeedCandidateLimit(), 5000)
    process.env.FEED_CANDIDATE_LIMIT = '0'; assert.equal(getFeedCandidateLimit(), 100)
  } finally {
    if (previous === undefined) delete process.env.FEED_CANDIDATE_LIMIT
    else process.env.FEED_CANDIDATE_LIMIT = previous
  }
})

test('cache key deduplicates order while preserving case-sensitive database handles', () => {
  const key = sourceHandlesCacheKey(['DrJimFan', 'sama', ' DrJimFan '])
  assert.equal(key, sourceHandlesCacheKey(['sama', 'DrJimFan']))
  assert.ok(expandHandleQueryVariants(key.split('\n')).includes('DrJimFan'))
})
