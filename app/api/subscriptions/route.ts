import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  getSubscribedSourceIdsForUser,
  subscribeUserToSource,
  unsubscribeUserFromSource,
} from '@/lib/services/user-subscriptions-service'

/**
 * GET /api/subscriptions
 * 获取当前用户所有订阅的 source_id 列表
 */
export async function GET() {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const subscribedSourceIds = await getSubscribedSourceIdsForUser(user!.id)
    return NextResponse.json({
      success: true,
      subscribedSourceIds,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取订阅列表失败'
    console.error('Failed to get subscriptions:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/**
 * POST /api/subscriptions
 * 订阅信息源 { source_id: string, source_handle: string }
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const body = await request.json()
    const { source_id, source_handle } = body

    if (!source_id || typeof source_id !== 'string') {
      return NextResponse.json(
        { success: false, error: '请提供有效的 source_id' },
        { status: 400 }
      )
    }

    if (!source_handle || typeof source_handle !== 'string') {
      return NextResponse.json(
        { success: false, error: '请提供有效的 source_handle' },
        { status: 400 }
      )
    }

    await subscribeUserToSource(user!.id, source_id, source_handle)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '订阅失败'
    console.error('Failed to subscribe source:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/subscriptions?id=source_id
 * 取消订阅
 */
export async function DELETE(request: NextRequest) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const { searchParams } = new URL(request.url)
    const sourceId = searchParams.get('id')

    if (!sourceId) {
      return NextResponse.json({ success: false, error: '请提供 source_id' }, { status: 400 })
    }

    await unsubscribeUserFromSource(user!.id, sourceId)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '取消订阅失败'
    console.error('Failed to unsubscribe source:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
