import 'server-only'

import { unstable_cache } from 'next/cache'
import {
  getPersistedInsightForRead,
  mergeInsightGlobalPayload,
  normalizeNewsItemId,
} from '@/lib/db/news'
import { computeInsightAnalysis, type InsightAnalysisPayload } from '@/lib/post-insight-compute'
import {
  consumeAnalysisRateLimit,
  getClientRateLimitKey,
} from '@/lib/analysis-rate-limit'

/** INSIGHT 全局一份：按 postId 缓存；与订阅无关 */
const INSIGHT_CACHE_REVALIDATE_SEC = 60 * 60 * 24

export type PostInsightServiceResult =
  | { kind: 'success'; analysis: InsightAnalysisPayload }
  | { kind: 'not_found' }
  | { kind: 'bad_request'; error: string }
  | { kind: 'rate_limited'; error: string; retryAfterSec: number }
  | { kind: 'server_error'; error: string }

/**
 * POST /api/analysis 主体逻辑（不含 Response 封装）
 */
export async function runPostInsightForRequest(request: Request): Promise<PostInsightServiceResult> {
  try {
    const body = await request.json().catch(() => ({}))
    const postId = body.postId

    if (!postId || typeof postId !== 'string') {
      return { kind: 'bad_request', error: 'Missing postId' }
    }

    const normalizedPostId = normalizeNewsItemId(postId)

    /** 已持久化（抓取流程里已算过）则直接返回，不占 AI 限流，便于客户端预取 */
    const fromDb = await getPersistedInsightForRead(normalizedPostId)
    if (fromDb) {
      return { kind: 'success', analysis: fromDb }
    }

    const limitKey = getClientRateLimitKey(request)
    const limited = consumeAnalysisRateLimit(limitKey)
    if (!limited.ok) {
      return {
        kind: 'rate_limited',
        error: '请求过于频繁，请稍后再试',
        retryAfterSec: limited.retryAfterSec,
      }
    }

    const getCached = unstable_cache(
      async () => {
        const computed = await computeInsightAnalysis({
          postId: normalizedPostId,
          subscribedSourcesLines: '',
        })
        if (computed) {
          await mergeInsightGlobalPayload(normalizedPostId, computed)
        }
        return computed
      },
      ['post-insight-global', normalizedPostId],
      { revalidate: INSIGHT_CACHE_REVALIDATE_SEC }
    )

    const analysis = await getCached()

    if (!analysis) {
      return { kind: 'not_found' }
    }

    return { kind: 'success', analysis }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Analysis generation failed'
    return { kind: 'server_error', error: message }
  }
}
