import { runRefreshProcessRawQueue } from '@/lib/services/process-service'

export const maxDuration = 60

/**
 * POST /api/refresh/process
 * 只负责 AI 处理，从 Supabase raw_posts 读取，写入 news_items
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const data = await runRefreshProcessRawQueue(body)
    return Response.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '处理失败'
    console.error('[Process API] Error:', error)
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
