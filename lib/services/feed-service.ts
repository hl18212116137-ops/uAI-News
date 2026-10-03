import 'server-only'

import type { NextRequest } from 'next/server'
import { getRecommendedSources, RECOMMENDED_SIDEBAR_LIMIT } from '@/lib/subscriptions'
import { getCurrentUser } from '@/lib/auth'

function parseExcludeIds(param: string | null): string[] {
  if (!param || !param.trim()) return []
  return param
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export type RecommendedSourcesQuery = {
  limit: number
  pickRandom: boolean
  excludeSourceIds: string[] | undefined
  excludeHandles: string[] | undefined
}

export function parseRecommendedSourcesSearchParams(
  searchParams: URLSearchParams
): RecommendedSourcesQuery {
  const raw = parseInt(searchParams.get('limit') || String(RECOMMENDED_SIDEBAR_LIMIT), 10)
  const limit = Math.min(50, Math.max(1, Number.isFinite(raw) ? raw : RECOMMENDED_SIDEBAR_LIMIT))

  const randomParam = searchParams.get('random')
  const pickRandom =
    randomParam === '1' || randomParam === 'true' || randomParam === 'yes'

  const excludeSourceIds = parseExcludeIds(searchParams.get('excludeIds'))
  const excludeHandles = parseExcludeIds(searchParams.get('excludeHandles'))

  return {
    limit,
    pickRandom,
    excludeSourceIds: excludeSourceIds.length ? excludeSourceIds : undefined,
    excludeHandles: excludeHandles.length ? excludeHandles : undefined,
  }
}

/**
 * 解析 query + session，拉取推荐源列表（与 GET /api/recommended-sources 一致）
 */
export async function loadRecommendedSourcesForApi(
  request: NextRequest
) {
  const q = parseRecommendedSourcesSearchParams(new URL(request.url).searchParams)

  const user = await getCurrentUser()
  const userId = user?.id ?? null

  return getRecommendedSources(userId, q.limit, {
    pickRandom: q.pickRandom,
    excludeSourceIds: q.excludeSourceIds,
    excludeHandles: q.excludeHandles,
  })
}
