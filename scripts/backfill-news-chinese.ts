/**
 * 将 news_items 中仍为英文的 title / summary / content / original_text / referenced_post
 * 及 insight_json 内字符串批量译为中文（已判定为中文的字段跳过）。
 *
 * 用法（需 .env 含 Supabase service role 与 AI 密钥）:
 *   npx tsx scripts/backfill-news-chinese.ts
 *   npx tsx scripts/backfill-news-chinese.ts --dry-run
 */
import 'dotenv/config'

import { getDefaultAIService } from '../lib/ai/ai-factory'
import {
  getAllPosts,
  updateNewsItemTextFields,
  readInsightJsonDocForPost,
  writeInsightJsonDocForPost,
  type InsightJsonDoc,
  type NewsItemTextPatch,
} from '../lib/db/news'
import { isMostlyChinese } from '../lib/text-locale'
import type { InsightAnalysisPayload, NewsItem } from '../lib/types'

const DRY = process.argv.includes('--dry-run')
const CONCURRENCY = Number.parseInt(process.env.BACKFILL_ZH_CONCURRENCY || '2', 10) || 2

async function condTranslate(
  translate: (s: string) => Promise<string>,
  s: string | null | undefined,
): Promise<string | null> {
  if (s == null) return null
  const raw = String(s)
  const t = raw.trim()
  if (!t) return raw
  if (isMostlyChinese(raw)) return raw
  return translate(raw)
}

async function translateInsightPayload(
  translate: (s: string) => Promise<string>,
  p: InsightAnalysisPayload,
): Promise<InsightAnalysisPayload> {
  const review = p.review
  const reviewNext =
    review && review.length > 0
      ? await Promise.all(review.map((line) => condTranslate(translate, line)))
      : review

  const [originalTranslation, originalTranslationReferenced] = await Promise.all([
    condTranslate(translate, p.originalTranslation),
    condTranslate(translate, p.originalTranslationReferenced),
  ])

  return {
    ...p,
    review: reviewNext,
    originalTranslation,
    originalTranslationReferenced,
  }
}

async function translateInsightDoc(
  translate: (s: string) => Promise<string>,
  doc: InsightJsonDoc,
): Promise<InsightJsonDoc> {
  const byNext: Record<string, InsightAnalysisPayload> = {}
  for (const [k, v] of Object.entries(doc.bySourcesSig)) {
    byNext[k] = await translateInsightPayload(translate, v)
  }
  const globalNext =
    doc.global != null ? await translateInsightPayload(translate, doc.global) : doc.global

  return {
    v: doc.v,
    bySourcesSig: byNext,
    ...(globalNext !== undefined ? { global: globalNext } : {}),
  }
}

async function backfillPostTexts(
  post: NewsItem,
  translate: (s: string) => Promise<string>,
): Promise<{ updated: boolean; patch: NewsItemTextPatch }> {
  const [title, summary, content, originalText, refText] = await Promise.all([
    condTranslate(translate, post.title),
    condTranslate(translate, post.summary),
    condTranslate(translate, post.content),
    condTranslate(translate, post.originalText),
    post.referencedPost?.text
      ? condTranslate(translate, post.referencedPost.text)
      : Promise.resolve(null as string | null),
  ])

  const patch: NewsItemTextPatch = {}
  if (title != null && title !== post.title) patch.title = title
  if (summary != null && summary !== post.summary) patch.summary = summary
  if (content != null && content !== post.content) patch.content = content
  if (originalText != null && originalText !== post.originalText) patch.originalText = originalText

  if (
    post.referencedPost &&
    refText != null &&
    refText !== post.referencedPost.text
  ) {
    patch.referencedPost = { ...post.referencedPost, text: refText }
  }

  const updated = Object.keys(patch).length > 0
  return { updated, patch }
}

async function backfillOnePost(post: NewsItem, translate: (s: string) => Promise<string>) {
  const id = post.id
  let textResult: 'ok' | 'skip' | 'err' = 'skip'
  let insightResult: 'ok' | 'skip' | 'err' = 'skip'

  const { updated, patch } = await backfillPostTexts(post, translate)
  if (updated) {
    if (DRY) {
      console.log(`[dry-run] ${id} 将更新列: ${Object.keys(patch).join(', ')}`)
      textResult = 'ok'
    } else {
      const r = await updateNewsItemTextFields(id, patch)
      if (r.ok) {
        textResult = 'ok'
      } else {
        console.error(`[err] ${id} 文本更新失败:`, r.error)
        textResult = 'err'
      }
    }
  }

  const doc = await readInsightJsonDocForPost(id)
  if (doc && (Object.keys(doc.bySourcesSig).length > 0 || doc.global != null)) {
    try {
      const nextDoc = await translateInsightDoc(translate, doc)
      const same = JSON.stringify(doc) === JSON.stringify(nextDoc)
      if (same) {
        insightResult = 'skip'
      } else if (DRY) {
        console.log(`[dry-run] ${id} 将更新 insight_json`)
        insightResult = 'ok'
      } else {
        const w = await writeInsightJsonDocForPost(id, nextDoc)
        insightResult = w.ok ? 'ok' : 'err'
        if (!w.ok) console.error(`[err] ${id} insight_json 写入失败:`, w.error)
      }
    } catch (e) {
      console.error(`[err] ${id} insight 处理异常:`, e)
      insightResult = 'err'
    }
  }

  return { id, textResult, insightResult }
}

async function runPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return []
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (true) {
      const idx = next++
      if (idx >= items.length) break
      results[idx] = await fn(items[idx])
    }
  }
  const n = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: n }, () => worker()))
  return results
}

async function main() {
  console.log(DRY ? '模式: dry-run（不写库）\n' : '模式: 写库\n')
  const ai = getDefaultAIService()
  const translate = (s: string) => ai.translateContent(s)

  const posts = await getAllPosts()
  console.log(`共 ${posts.length} 条 news_items，并发 ${CONCURRENCY}\n`)

  const results = await runPool(posts, CONCURRENCY, (p) => backfillOnePost(p, translate))

  let textOk = 0
  let textSkip = 0
  let textErr = 0
  let insOk = 0
  let insSkip = 0
  let insErr = 0

  for (const r of results) {
    if (r.textResult === 'ok') textOk++
    else if (r.textResult === 'skip') textSkip++
    else textErr++
    if (r.insightResult === 'ok') insOk++
    else if (r.insightResult === 'skip') insSkip++
    else insErr++
  }

  console.log('\n--- 汇总 ---')
  console.log(
    `正文列: 更新 ${textOk} 跳过 ${textSkip} 失败 ${textErr} | insight_json: 更新 ${insOk} 跳过 ${insSkip} 失败 ${insErr}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
