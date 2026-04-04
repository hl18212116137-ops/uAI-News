import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSubscribedFeed } from '@/lib/subscriptions'

export async function GET() {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const posts = await getSubscribedFeed(user.id)
    return NextResponse.json({ success: true, posts })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取订阅 feed 失败'
    console.error('GET /api/me/subscribed-feed:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
