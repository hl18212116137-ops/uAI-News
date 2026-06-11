import { z } from 'zod'

import { requireAuth } from '@/lib/auth'
import { getFetchPipelinePublicConfigPayload } from '@/lib/fetch-pipeline-public-config'
import { isPipelineAdmin } from '@/lib/pipeline-admin'
import {
  upsertSitePipelineSettings,
  type SitePipelineSettingsWrite,
} from '@/lib/pipeline-settings'

const putBodySchema = z.object({
  rawMinOuterChars: z.number().int().min(0).max(500).nullable().optional(),
  rawMinNestedCharsRetweet: z.number().int().min(0).max(500).nullable().optional(),
  ingestDedupeRssBlogMatchNewsUrl: z.boolean().nullable().optional(),
})

/**
 * 站点流水线配置（管理员）。需在环境变量中配置 PIPELINE_ADMIN_EMAILS 或 PIPELINE_ADMIN_USER_IDS。
 * Body 字段省略表示不修改；显式 `null` 表示清除 DB 覆盖、回退到环境变量。
 */
export async function PUT(request: Request) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  if (!isPipelineAdmin(user)) {
    return Response.json({ error: '无权限：未在 PIPELINE_ADMIN_EMAILS / PIPELINE_ADMIN_USER_IDS 中配置' }, { status: 403 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return Response.json({ error: '请求体须为 JSON' }, { status: 400 })
  }

  const parsed = putBodySchema.safeParse(json)
  if (!parsed.success) {
    return Response.json(
      { error: '参数无效', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const body = parsed.data
  const write: SitePipelineSettingsWrite = {}
  if (body.rawMinOuterChars !== undefined) write.rawMinOuterChars = body.rawMinOuterChars
  if (body.rawMinNestedCharsRetweet !== undefined) {
    write.rawMinNestedCharsRetweet = body.rawMinNestedCharsRetweet
  }
  if (body.ingestDedupeRssBlogMatchNewsUrl !== undefined) {
    write.ingestDedupeRssBlogMatchNewsUrl = body.ingestDedupeRssBlogMatchNewsUrl
  }
  if (Object.keys(write).length === 0) {
    return Response.json({ error: '至少提供一个字段' }, { status: 400 })
  }

  try {
    await upsertSitePipelineSettings(write)
  } catch (e) {
    const message = e instanceof Error ? e.message : '保存失败'
    console.error('[admin/pipeline-settings]', e)
    return Response.json({ error: message }, { status: 500 })
  }

  const config = await getFetchPipelinePublicConfigPayload(user)
  return Response.json({ success: true, config })
}
