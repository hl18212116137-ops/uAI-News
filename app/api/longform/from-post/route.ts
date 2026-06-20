import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getDefaultAIService } from '@/lib/ai/ai-factory'
import { getPostById, normalizeNewsItemId, updateNewsItemLongform } from '@/lib/db/news'
import { extractLongformForRawPost } from '@/lib/longform'
import { enrichLongformArticle, precomputeLongformInsight } from '@/lib/longform-enrichment'
import type { NewsItem } from '@/lib/types'

export const runtime = 'nodejs'

const NO_LONGFORM_MESSAGE = '没有长文存在：这条推文里没有识别到可抓取的文章链接或论文截图'

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { postId?: unknown }
    const postId = typeof body.postId === 'string' ? body.postId.trim() : ''
    if (!postId) {
      return NextResponse.json({ success: false, error: '缺少 postId 参数' }, { status: 400 })
    }

    const normalizedId = normalizeNewsItemId(postId)
    const existing = await getPostById(normalizedId)
    if (!existing) {
      return NextResponse.json({ success: false, error: '没有找到这条推文' }, { status: 404 })
    }

    const aiService = getDefaultAIService()

    if (existing.longform?.translatedContent) {
      const enriched = await enrichLongformArticle(existing.longform, aiService)
      if (
        enriched.digestSummary !== existing.longform.digestSummary ||
        JSON.stringify(enriched.digestPoints ?? []) !== JSON.stringify(existing.longform.digestPoints ?? []) ||
        enriched.readingContent !== existing.longform.readingContent
      ) {
        const saved = await updateNewsItemLongform(existing.id, enriched)
        if (!saved.ok) {
          return NextResponse.json(
            { success: false, error: saved.error || '长文保存失败' },
            { status: 500 },
          )
        }
        await precomputeLongformInsight({
          postId: existing.id,
          article: enriched,
          aiService,
          source: existing.source,
        })
        return NextResponse.json({
          success: true,
          post: { ...existing, longform: enriched } satisfies NewsItem,
          alreadyExists: true,
        })
      }
      return NextResponse.json({ success: true, post: existing, alreadyExists: true })
    }

    const extracted = await extractLongformForRawPost(
      {
        platform: existing.source.platform,
        text: existing.originalText || existing.content || existing.summary,
        sourceUrl: existing.source.url,
        authorName: existing.source.name,
        authorHandle: existing.source.handle,
        mediaUrls: existing.mediaUrls,
        referencedPost: existing.referencedPost,
      },
      (text) => aiService.translateContent(text),
    )

    if (!extracted?.translatedContent) {
      return NextResponse.json(
        { success: false, code: 'NO_LONGFORM', error: NO_LONGFORM_MESSAGE },
        { status: 404 },
      )
    }

    const longform = await enrichLongformArticle(extracted, aiService)
    const saved = await updateNewsItemLongform(existing.id, longform)
    if (!saved.ok) {
      return NextResponse.json(
        { success: false, error: saved.error || '长文保存失败' },
        { status: 500 },
      )
    }

    await precomputeLongformInsight({
      postId: existing.id,
      article: longform,
      aiService,
      source: existing.source,
    })

    revalidatePath('/')
    const post: NewsItem = { ...existing, longform }
    return NextResponse.json({ success: true, post })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '长文抓取失败'
    console.error('[longform from post] failed:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
