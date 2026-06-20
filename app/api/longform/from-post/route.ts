import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getDefaultAIService } from '@/lib/ai/ai-factory'
import { getPostById, normalizeNewsItemId, updateNewsItemLongform } from '@/lib/db/news'
import { extractLongformForRawPost } from '@/lib/longform'
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

    if (existing.longform?.translatedContent) {
      return NextResponse.json({ success: true, post: existing, alreadyExists: true })
    }

    const aiService = getDefaultAIService()
    const longform = await extractLongformForRawPost(
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

    if (!longform?.translatedContent) {
      return NextResponse.json(
        { success: false, code: 'NO_LONGFORM', error: NO_LONGFORM_MESSAGE },
        { status: 404 },
      )
    }

    const saved = await updateNewsItemLongform(existing.id, longform)
    if (!saved.ok) {
      return NextResponse.json(
        { success: false, error: saved.error || '长文保存失败' },
        { status: 500 },
      )
    }

    revalidatePath('/')
    const post: NewsItem = { ...existing, longform }
    return NextResponse.json({ success: true, post })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '长文抓取失败'
    console.error('[longform from post] failed:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
