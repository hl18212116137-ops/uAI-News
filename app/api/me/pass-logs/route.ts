import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { listPassedPosts, promotePassedPosts } from '@/lib/db/pass-logs'
import { revalidateHomeFeedCaches } from '@/lib/home-cache-invalidation'
import { getUserSubscribedHandles } from '@/lib/subscriptions'

export async function GET(request: Request) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const { searchParams } = new URL(request.url)
    const rawLimit = Number(searchParams.get('limit') ?? 60)
    const limit = Number.isFinite(rawLimit) ? rawLimit : 60
    const handles = await getUserSubscribedHandles(user.id)
    const logs = await listPassedPosts({ handles, limit, userId: user.id })

    return NextResponse.json({
      success: true,
      logs,
      scopedToSubscribedSources: true,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取 PASS 记录失败'
    console.error('GET /api/me/pass-logs:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const body = (await request.json().catch(() => ({}))) as { ids?: unknown }
    const ids = Array.isArray(body.ids)
      ? body.ids.map((id) => String(id).trim()).filter(Boolean).slice(0, 30)
      : []

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: '请选择要推送的 PASS 推文' }, { status: 400 })
    }

    const handles = await getUserSubscribedHandles(user.id)
    const result = await promotePassedPosts({ userId: user.id, ids, handles })
    revalidateHomeFeedCaches()

    return NextResponse.json({
      success: true,
      ...result,
      message: result.promoted > 0 ? `已推送 ${result.promoted} 条到网页` : '没有可推送的条目',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '推送 PASS 推文失败'
    console.error('POST /api/me/pass-logs:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
