import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { areNewsItemsNearDuplicate, dedupeNewsItemsForDisplay, newsItemDedupeKeys } from '../lib/news-dedupe'
import type { NewsItem } from '../lib/types'

// Baseline algorithm retained only here to make the performance comparison reproducible.
function baseline(items: NewsItem[]) {
  const seen = new Set<string>()
  const out: NewsItem[] = []
  for (const item of items) {
    const keys = newsItemDedupeKeys(item)
    if (keys.some((key) => seen.has(key)) || out.some((prior) => areNewsItemsNearDuplicate(prior, item))) continue
    out.push(item)
    for (const key of keys) seen.add(key)
  }
  return out
}
const items: NewsItem[] = Array.from({ length: 1000 }, (_, index) => ({
  id: `benchmark-${index}`, title: `研究进展 ${index}`, summary: `研究组${index}发布独立的模型评估结果`,
  content: `任务描述${index}，具体实验内容${index}，不同研究${index}，局限和结论。`, originalText: `experiment${index} metric${index}`,
  source: { platform: 'Blog', handle: `source-${index % 20}`, name: 'Benchmark', url: `https://example.test/${index}` },
  category: '研究', publishedAt: '2026-10-01T00:00:00Z', createdAt: '2026-10-01T00:00:00Z',
}))
for (const fn of [baseline, dedupeNewsItemsForDisplay]) fn(items.slice(0, 50))
const start = performance.now()
const expected = baseline(items)
const baselineMs = performance.now() - start
const nextStart = performance.now()
const actual = dedupeNewsItemsForDisplay(items)
const optimizedMs = performance.now() - nextStart
assert.deepEqual(actual, expected)
console.log(JSON.stringify({ stories: items.length, retained: actual.length,
  baselineMs: +baselineMs.toFixed(2), optimizedMs: +optimizedMs.toFixed(2), speedup: +(baselineMs / optimizedMs).toFixed(1),
  scope: 'Synthetic CPU benchmark only; not a production page latency measurement.' }, null, 2))
