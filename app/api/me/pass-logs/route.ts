import { isPipelineAdmin } from '@/lib/pipeline-admin'
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
    const moderation = searchParams.get('scope') === 'moderation'
    if (moderation && !isPipelineAdmin(user)) return NextResponse.json({ error: '此操作仅限管理员' }, { status: 403 })
    const rawLimit = Number(searchParams.get('limit') ?? 60)
    const limit = Number.isFinite(rawLimit) ? rawLimit : 60
    const handles = await getUserSubscribedHandles(user.id)
    const logs = await listPassedPosts({ handles, limit, userId: user.id, personalOnly: !moderation })

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
    const body = (await request.json().catch(() => ({}))) as { ids?: unknown; scope?: string }
    const moderation = body.scope === 'moderation'
    if (moderation && !isPipelineAdmin(user)) return NextResponse.json({ error: '此操作仅限管理员' }, { status: 403 })
    const ids = Array.isArray(body.ids)
      ? body.ids.map((id) => String(id).trim()).filter(Boolean).slice(0, 30)
      : []

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: '请选择要恢复的内容' }, { status: 400 })
    }

    const handles = await getUserSubscribedHandles(user.id)
    const result = await promotePassedPosts({ userId: user.id, ids, handles, personalOnly: !moderation })
    revalidateHomeFeedCaches()

    return NextResponse.json({
      success: true,
      ...result,
      message: result.promoted > 0 ? `已恢复 ${result.promoted} 条内容` : '没有可恢复的内容',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '推送 PASS 推文失败'
    console.error('POST /api/me/pass-logs:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
