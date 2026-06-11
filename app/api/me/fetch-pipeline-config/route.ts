import { requireAuth } from '@/lib/auth'
import { getFetchPipelinePublicConfigPayload } from '@/lib/fetch-pipeline-public-config'

/** 返回当前站点抓取 / 处理流水线的公开规则快照（需登录，不含密钥） */
export async function GET() {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const config = await getFetchPipelinePublicConfigPayload(user)
  return Response.json({ success: true, config })
}