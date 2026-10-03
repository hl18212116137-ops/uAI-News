import { requireAuth } from '@/lib/auth'
import { revalidateHomeFeedCaches } from '@/lib/home-cache-invalidation'
import { readingPreferenceSchema } from '@/lib/reading-preferences'
import { getFeedVisibleDaysEffective } from '@/lib/feed-window'
import { clampRecommendationVisibleDays, createRule, deleteRule, listRules } from '@/lib/user-pipeline-rules'

/** Only executable reading preferences are exposed. Historical rules stay stored. */
export async function GET(request: Request) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  const module = new URL(request.url).searchParams.get('module')
  if (module && module !== 'recommendation' && module !== 'all') {
    return Response.json({ error: '此规则模块已停用' }, { status: 400 })
  }
  try {
    const rules = (await listRules(user.id, 'recommendation', { strict: true }))
      .filter((rule) => readingPreferenceSchema.safeParse(rule).success)
    return Response.json({ success: true, rules, maxVisibleDays: getFeedVisibleDaysEffective() })
  } catch (error) {
    console.error('[reading preferences]', error)
    return Response.json({ error: '阅读偏好暂时无法读取' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return Response.json({ error: '请求体须为 JSON' }, { status: 400 })
  }

  const parsed = readingPreferenceSchema.safeParse(json)
  if (!parsed.success) {
    return Response.json(
      { error: '参数无效', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { module, ruleType, payload } = parsed.data

  let payloadOut: Record<string, unknown> = { ...payload }
  if (ruleType === 'recommendation_visible_days') {
    const d = clampRecommendationVisibleDays(Number(payload.days))
    payloadOut = { days: d }
  }

  try {
    const rule = await createRule(user.id, module, ruleType, payloadOut)
    revalidateHomeFeedCaches()
    return Response.json({ success: true, rule })
  } catch (e) {
    const message = e instanceof Error ? e.message : '创建失败'
    const status = message.includes('最多') ? 400 : 500
    return Response.json({ error: message }, { status })
  }
}

export async function DELETE(request: Request) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const id = new URL(request.url).searchParams.get('id')
  if (!id?.trim()) {
    return Response.json({ error: '缺少 id 参数' }, { status: 400 })
  }

  try {
    const ok = await deleteRule(user.id, id.trim())
    if (!ok) return Response.json({ error: '规则不存在或无权删除' }, { status: 404 })
    revalidateHomeFeedCaches()
    return Response.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : '删除失败'
    return Response.json({ error: message }, { status: 500 })
  }
}
