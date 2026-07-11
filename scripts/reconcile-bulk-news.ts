/**
 * 对批量入库（固定 60 分 / 绕过 AI 筛选）的 news_items 重新走 important + 评分流程。
 * 用法: npx tsx scripts/reconcile-bulk-news.ts
 */
import './server-only-stub.cjs'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

import { db } from '../lib/db/drizzle'
import { newsItems } from '../lib/db/schema'
import { eq, like, or, sql } from 'drizzle-orm'
import { getDefaultAIService } from '../lib/ai/ai-factory'
import {
  deleteNewsItemById,
  updateNewsItemImportanceScore,
} from '../lib/db/news'
import { isPlaceholderNewsItem } from '../lib/feed-quality'
import { composeTextForAiProcessing } from '../lib/x'
import type { NewsCategory } from '../lib/types'

const CONCURRENCY = Number.parseInt(process.env.RECONCILE_CONCURRENCY || '2', 10) || 2
const BULK_SCORE_MARKER = 60

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = []
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return out
}

async function reconcileOne(row: typeof newsItems.$inferSelect) {
  const handle = row.sourceHandle ?? ''
  const authorName = row.sourceName ?? handle
  const text = composeTextForAiProcessing(
    row.originalText ?? row.content ?? row.summary ?? '',
    null,
  )

  if (!text.trim()) {
    await deleteNewsItemById(row.id)
    console.log(`[drop] ${row.id}: 无正文`)
    return 'dropped' as const
  }

  try {
    const ai = getDefaultAIService()
    const draft = await ai.processNews(text, authorName, handle)

    if (!draft.important) {
      await deleteNewsItemById(row.id)
      console.log(`[drop] ${row.id}: AI 判定不重要 — ${draft.title}`)
      return 'dropped' as const
    }

    const score = await ai.scoreNewsImportance({
      title: isPlaceholderNewsItem(row) ? draft.title : (row.title ?? draft.title),
      summary: isPlaceholderNewsItem(row) ? draft.summary : (row.summary ?? draft.summary),
      content: row.content ?? draft.summary,
      category: (row.category ?? draft.category) as NewsCategory,
      authorName,
      authorHandle: handle,
      publishedAt:
        row.publishedAt instanceof Date
          ? row.publishedAt.toISOString()
          : String(row.publishedAt ?? new Date().toISOString()),
    })

    await updateNewsItemImportanceScore(row.id, score)

    if (isPlaceholderNewsItem(row)) {
      await db
        .update(newsItems)
        .set({
          title: draft.title,
          summary: draft.summary,
          category: draft.category as NewsCategory,
        })
        .where(eq(newsItems.id, row.id))
    }

    console.log(`[keep] ${row.id}: score=${score}`)
    return 'kept' as const
  } catch (e) {
    console.error(`[err] ${row.id}:`, e)
    return 'err' as const
  }
}

async function main() {
  const rows = await db
    .select()
    .from(newsItems)
    .where(
      or(
        like(newsItems.id, 'x-%'),
        sql`${newsItems.importanceScore} = ${BULK_SCORE_MARKER}`,
      ),
    )

  const targets = rows.filter(
    (r) =>
      r.importanceScore === BULK_SCORE_MARKER ||
      isPlaceholderNewsItem({ title: r.title ?? '', summary: r.summary ?? '' }),
  )

  console.log(`待复核 ${targets.length} 条（并发 ${CONCURRENCY}）\n`)

  const results = await runPool(targets, CONCURRENCY, reconcileOne)
  const kept = results.filter((x) => x === 'kept').length
  const dropped = results.filter((x) => x === 'dropped').length
  const err = results.filter((x) => x === 'err').length
  console.log(`\n完成: kept=${kept} dropped=${dropped} err=${err}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
