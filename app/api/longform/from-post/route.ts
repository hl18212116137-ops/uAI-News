import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getDefaultAIService } from '@/lib/ai/ai-factory'
import { getPostById, normalizeNewsItemId, updateNewsItemLongform } from '@/lib/db/news'
import {
  discoverLongformForPost,
  formatLongformDiscoveryFailure,
} from '@/lib/longform-discovery'
import { enrichLongformArticle, precomputeLongformInsight } from '@/lib/longform-enrichment'
import type { NewsItem } from '@/lib/types'

export const runtime = 'nodejs'

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
        JSON.stringify(enriched.digestPoints ?? []) !== JSON.stringify(existing.longform.digestPoints ?? [])
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

    const discovery = await discoverLongformForPost({
      post: existing,
      translate: (text) => aiService.translateContent(text),
    })

    if (!discovery.article?.translatedContent) {
      if (discovery.error) {
        return NextResponse.json(
          {
            success: false,
            code: 'VIDEO_TRANSCRIPT_FAILED',
            error: `视频转写失败：${discovery.error.message}`,
            attempts: discovery.attempts,
          },
          { status: 502 },
        )
      }

      return NextResponse.json(
        {
          success: false,
          code: 'NO_LONGFORM',
          error: formatLongformDiscoveryFailure(discovery.attempts),
          attempts: discovery.attempts,
        },
        { status: 404 },
      )
    }

    const longform = await enrichLongformArticle(discovery.article, aiService)
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
    return NextResponse.json({ success: true, post, attempts: discovery.attempts })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '长文抓取失败'
    console.error('[longform from post] failed:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
