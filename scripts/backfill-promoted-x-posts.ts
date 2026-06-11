/**
 * 为 promote-raw-posts 生成的占位 news_items 回填真实推文正文与 AI 中文标题。
 * 用法: npx tsx scripts/backfill-promoted-x-posts.ts
 */
import './server-only-stub.cjs'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

import { db } from '../lib/db/drizzle'
import { newsItems } from '../lib/db/schema'
import { eq, like, or } from 'drizzle-orm'
import { getDefaultAIService } from '../lib/ai/ai-factory'
import { updateNewsItemTextFields } from '../lib/db/news'
import { upsertRawPosts } from '../lib/db/raw-posts'
import { composeTextForAiProcessing, fetchPostsFromX } from '../lib/x'
import { parseXStatusUrl } from '../lib/news-post-url'
import { translateNewsOriginalToChinese } from '../lib/news-original-chinese'
import type { NewsCategory } from '../lib/types'

const CONCURRENCY = Number.parseInt(process.env.BACKFILL_X_CONCURRENCY || '2', 10) || 2

function isPlaceholderItem(title: string, summary: string): boolean {
  const t = title.trim()
  const s = summary.trim()
  return t.endsWith('的推文') || s.startsWith('来自 @')
}

function statusIdFromNewsId(newsId: string): string | null {
  const id = newsId.trim()
  const m = id.match(/^x-(\d{5,})$/i)
  return m ? m[1] : /^\d{5,}$/.test(id) ? id : null
}

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

async function backfillOne(
  row: typeof newsItems.$inferSelect,
  tweetById: Map<string, Awaited<ReturnType<typeof fetchPostsFromX>>[number]>,
) {
  const parsed = parseXStatusUrl(row.sourceUrl ?? '')
  const statusId = parsed?.statusId ?? statusIdFromNewsId(row.id)
  if (!statusId) {
    console.warn(`[skip] ${row.id}: 无 status id`)
    return 'skip' as const
  }

  const tweet = tweetById.get(statusId)
  if (!tweet) {
    console.warn(`[skip] ${row.id}: 时间线中未找到 ${statusId}`)
    return 'skip' as const
  }

  try {
    const textForAi = composeTextForAiProcessing(tweet.post_text, tweet.referencedPost)
    if (!textForAi.trim()) {
      console.warn(`[skip] ${row.id}: 推文正文为空`)
      return 'skip' as const
    }

    const handle = parsed?.handle ?? row.sourceHandle ?? 'unknown'
    const authorName = row.sourceName ?? handle
    const ai = getDefaultAIService()
    const aiDraft = await ai.processNews(textForAi, authorName, handle)
    if (!aiDraft.important) {
      const { deleteNewsItemById } = await import('../lib/db/news')
      await deleteNewsItemById(row.id)
      console.log(`[drop] ${row.id}: AI 判定不重要`)
      return 'drop' as const
    }
    const [translatedContent, zhOriginal] = await Promise.all([
      ai.translateContent(textForAi),
      translateNewsOriginalToChinese((s) => ai.translateContent(s), tweet.post_text, tweet.referencedPost),
    ])

    await upsertRawPosts([
      {
        id: tweet.post_id,
        platform: 'X',
        handle,
        author_name: authorName,
        text: tweet.post_text,
        url: tweet.post_url,
        published_at: tweet.posted_at,
        ...(tweet.media_urls ? { media_urls: tweet.media_urls } : {}),
        ...(tweet.social_engagement ? { social_engagement: tweet.social_engagement } : {}),
        ...(tweet.referencedPost ? { referenced_post: tweet.referencedPost } : {}),
      },
    ])

    const patch = {
      title: aiDraft.title,
      summary: aiDraft.summary,
      content: translatedContent,
      originalText: zhOriginal.originalText,
      ...(zhOriginal.referencedPost ? { referencedPost: zhOriginal.referencedPost } : {}),
    }

    const r = await updateNewsItemTextFields(row.id, patch)
    if (!r.ok) {
      console.error(`[err] ${row.id}:`, r.error)
      return 'err' as const
    }

    let importanceScore = 50
    try {
      importanceScore = await ai.scoreNewsImportance({
        title: aiDraft.title,
        summary: aiDraft.summary,
        content: translatedContent,
        category: aiDraft.category as NewsCategory,
        authorName,
        authorHandle: handle,
        publishedAt: tweet.posted_at,
      })
    } catch {
      /* keep default */
    }

    await db
      .update(newsItems)
      .set({
        category: aiDraft.category as NewsCategory,
        publishedAt: new Date(tweet.posted_at),
        mediaUrls: tweet.media_urls ?? null,
        socialEngagement: tweet.social_engagement ?? null,
        sourceUrl: tweet.post_url,
        importanceScore,
      })
      .where(eq(newsItems.id, row.id))

    console.log(`[ok] ${row.id} score=${importanceScore} ← ${tweet.post_url}`)
    return 'ok' as const
  } catch (e) {
    console.error(`[err] ${row.id}:`, e)
    return 'err' as const
  }
}

async function main() {
  const rows = await db
    .select()
    .from(newsItems)
    .where(or(like(newsItems.id, 'x-%'), like(newsItems.title, '%的推文')))

  const targets = rows.filter((r) => isPlaceholderItem(r.title ?? '', r.summary ?? ''))
  const handles = [
    ...new Set(
      targets
        .map((r) => parseXStatusUrl(r.sourceUrl ?? '')?.handle ?? r.sourceHandle ?? '')
        .map((h) => h.replace(/^@/, '').trim())
        .filter(Boolean),
    ),
  ]

  console.log(`待回填 ${targets.length} 条，来源 handles: ${handles.join(', ')}\n`)

  const tweetById = new Map<string, Awaited<ReturnType<typeof fetchPostsFromX>>[number]>()
  for (const handle of handles) {
    console.log(`抓取 @${handle} 时间线…`)
    const posts = await fetchPostsFromX(handle)
    for (const p of posts) {
      tweetById.set(p.post_id, p)
    }
    console.log(`  → ${posts.length} 条`)
  }

  const results = await runPool(targets, CONCURRENCY, (row) => backfillOne(row, tweetById))
  const ok = results.filter((x) => x === 'ok').length
  const drop = results.filter((x) => x === 'drop').length
  const skip = results.filter((x) => x === 'skip').length
  const err = results.filter((x) => x === 'err').length
  console.log(`\n完成: ok=${ok} drop=${drop} skip=${skip} err=${err}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
