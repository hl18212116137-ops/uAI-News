import 'server-only'

import type { NextRequest } from 'next/server'
import { getRecommendedSources } from '@/lib/subscriptions'
import { createSupabaseServerClient } from '@/lib/supabase/server'

function parseExcludeIds(param: string | null): string[] {
  if (!param || !param.trim()) return []
  return param
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export type RecommendedSourcesQuery = {
  limit: number
  userId: string | null
  pickRandom: boolean
  excludeSourceIds: string[] | undefined
}

export function parseRecommendedSourcesSearchParams(
  searchParams: URLSearchParams
): RecommendedSourcesQuery {
  const raw = parseInt(searchParams.get('limit') || '2', 10)
  const limit = Math.min(50, Math.max(1, Number.isFinite(raw) ? raw : 2))
  const userIdParam = searchParams.get('userId')

  const randomParam = searchParams.get('random')
  const pickRandom =
    randomParam === '1' || randomParam === 'true' || randomParam === 'yes'

  const excludeSourceIds = parseExcludeIds(searchParams.get('excludeIds'))

  return {
    limit,
    userId: userIdParam,
    pickRandom,
    excludeSourceIds: excludeSourceIds.length ? excludeSourceIds : undefined,
  }
}

/**
 * 解析 query + session，拉取推荐源列表（与 GET /api/recommended-sources 一致）
 */
export async function loadRecommendedSourcesForApi(
  request: NextRequest
) {
  const q = parseRecommendedSourcesSearchParams(new URL(request.url).searchParams)

  let userId: string | null = q.userId
  if (!userId) {
    const supabase = createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userId = user?.id || null
  }

  return getRecommendedSources(userId, q.limit, {
    pickRandom: q.pickRandom,
    excludeSourceIds: q.excludeSourceIds,
  })
}
