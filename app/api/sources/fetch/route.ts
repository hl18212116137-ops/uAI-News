import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { startFetchForSubscribedSource } from '@/lib/services/sources-service'

/**
 * POST /api/sources/fetch
 * 对已订阅的单源触发后台抓取（RECOMMEND 点 + 订阅后补抓）
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const body = await request.json()
    const sourceId = typeof body.sourceId === 'string' ? body.sourceId : ''

    const result = await startFetchForSubscribedSource(user!.id, sourceId)

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      )
    }

    return NextResponse.json({ success: true, taskId: result.taskId })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '启动抓取失败'
    console.error('POST /api/sources/fetch:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
