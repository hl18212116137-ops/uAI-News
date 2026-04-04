import 'server-only'

import { unstable_cache } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  getDefaultSubscribedHandles,
  getSubscribedSourcesMeta,
  getSubscribedSourcesMetaByHandles,
} from '@/lib/subscriptions'
import {
  getInsightPayloadBySourcesSig,
  mergeInsightPayloadForSourcesSig,
} from '@/lib/db/news'
import {
  computeInsightAnalysis,
  insightSourcesSignature,
  type InsightAnalysisPayload,
} from '@/lib/post-insight-compute'
import {
  consumeAnalysisRateLimit,
  getClientRateLimitKey,
} from '@/lib/analysis-rate-limit'

/** INSIGHT 结果全页缓存（秒）；订阅列表变化时 sourcesSig 变化会自然分桶 */
const INSIGHT_CACHE_REVALIDATE_SEC = 60 * 60 * 24

const MAX_SOURCES_IN_PROMPT = 20

function formatSubscribedSourcesLines(
  metas: Array<{ name: string; handle: string }>
): string {
  return metas
    .slice(0, MAX_SOURCES_IN_PROMPT)
    .map((m) => `${m.name} (@${m.handle})`)
    .join('\n')
}

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
    const limitKey = getClientRateLimitKey(request)
    const limited = consumeAnalysisRateLimit(limitKey)
    if (!limited.ok) {
      return {
        kind: 'rate_limited',
        error: '请求过于频繁，请稍后再试',
        retryAfterSec: limited.retryAfterSec,
      }
    }

    const body = await request.json().catch(() => ({}))
    const postId = body.postId

    if (!postId || typeof postId !== 'string') {
      return { kind: 'bad_request', error: 'Missing postId' }
    }

    const supabase = createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    let subscribedSourcesLines = ''
    if (user?.id) {
      const metas = await getSubscribedSourcesMeta(user.id)
      subscribedSourcesLines = formatSubscribedSourcesLines(metas)
    } else {
      const handles = await getDefaultSubscribedHandles(3)
      const metas = await getSubscribedSourcesMetaByHandles(handles)
      subscribedSourcesLines = formatSubscribedSourcesLines(metas)
    }

    const userScope = user?.id ?? 'guest'
    const sourcesSig = insightSourcesSignature(subscribedSourcesLines)

    const fromDb = await getInsightPayloadBySourcesSig(postId, sourcesSig)
    if (fromDb) {
      return { kind: 'success', analysis: fromDb }
    }

    const getCached = unstable_cache(
      async () => {
        const computed = await computeInsightAnalysis({ postId, subscribedSourcesLines })
        if (computed) {
          await mergeInsightPayloadForSourcesSig(postId, sourcesSig, computed)
        }
        return computed
      },
      ['post-insight', postId, userScope, sourcesSig],
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
