import { runRefreshFetchFromEnabledSources } from '@/lib/services/ingest-service'
import { requirePipelineAdmin } from '@/lib/pipeline-admin'

export const maxDuration = 60

/**
 * POST /api/refresh/fetch
 * 只负责抓取推文/文章，存入 Supabase raw_posts 表
 */
export async function POST() {
  const { user, errorResponse } = await requirePipelineAdmin()
  if (errorResponse) return errorResponse
  try {
    const data = await runRefreshFetchFromEnabledSources({ userId: user.id })
    return Response.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '抓取失败'
    console.error('[Fetch API] Error:', error)
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
