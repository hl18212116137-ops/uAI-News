import 'server-only'

import { DEFAULT_INSIGHT_PERSONA } from '@/lib/insight-defaults'
import { mergeInsightGlobalPayload } from '@/lib/db/news'
import type { AIService } from '@/lib/ai/ai-service'
import type { InsightAnalysisPayload, LongformArticle, NewsItem } from '@/lib/types'

const LONGFORM_INSIGHT_MAX_CHARS = 12000

function cleanDigestPoints(points: string[] | undefined): string[] {
  return (points ?? [])
    .map((point) => String(point).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3)
}

function cleanReadingContent(value: string | undefined): string {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function enrichLongformArticle(
  article: LongformArticle,
  aiService: AIService,
): Promise<LongformArticle> {
  const hasDigest = Boolean(article.digestSummary?.trim()) && cleanDigestPoints(article.digestPoints).length === 3
  if (hasDigest && cleanReadingContent(article.readingContent)) {
    return article
  }

  try {
    const digest = await aiService.summarizeLongform({
      title: article.translatedTitle || article.title,
      content: article.translatedContent,
    })
    const summary = digest.summary.trim()
    const points = cleanDigestPoints(digest.points)
    const readingContent = cleanReadingContent(digest.readingContent)
    if (!summary && points.length === 0 && !readingContent) return article

    return {
      ...article,
      ...(summary ? { digestSummary: summary } : {}),
      ...(points.length > 0 ? { digestPoints: points } : {}),
      ...(readingContent ? { readingContent } : {}),
      excerpt: summary || article.excerpt,
    }
  } catch (error) {
    console.warn('[longform] digest enrichment skipped', error)
    return article
  }
}

export async function precomputeLongformInsight(args: {
  postId: string
  article: LongformArticle
  aiService: AIService
  source?: NewsItem['source']
}): Promise<void> {
  const body = args.article.translatedContent.trim()
  if (!body) return

  try {
    const analyzed = await args.aiService.analyzePost(
      body.slice(0, LONGFORM_INSIGHT_MAX_CHARS),
      args.article.authorName || args.source?.name || args.article.sourceName || '长文作者',
      args.source?.handle || args.article.sourceName || 'longform',
      {
        persona: DEFAULT_INSIGHT_PERSONA,
        subscribedSourcesLines: '',
      },
      null,
    )

    const review =
      analyzed.highlights && analyzed.highlights.length > 0
        ? analyzed.highlights.map((line) => line.trim()).filter(Boolean).slice(0, 3)
        : analyzed.canonicalSummary?.trim()
          ? [analyzed.canonicalSummary.trim()]
          : null

    const payload: InsightAnalysisPayload = {
      scores: typeof analyzed.importanceScore === 'number' ? analyzed.importanceScore : null,
      reliability: typeof analyzed.noveltyScore === 'number' ? analyzed.noveltyScore : null,
      review,
      originalTranslation: body,
      originalTranslationReferenced: null,
    }

    await mergeInsightGlobalPayload(args.postId, payload)
  } catch (error) {
    console.warn(`[longform] insight precompute skipped for ${args.postId}`, error)
  }
}
