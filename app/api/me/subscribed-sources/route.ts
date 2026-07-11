import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getCachedUserSubscribedSourcesMeta } from '@/lib/home-data-cache'

export async function GET() {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const { sources } = await getCachedUserSubscribedSourcesMeta(user.id)
    return NextResponse.json({ success: true, sources })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取订阅源列表失败'
    console.error('GET /api/me/subscribed-sources:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
