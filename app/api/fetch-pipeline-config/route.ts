import { getFetchPipelinePublicConfigPayload } from '@/lib/fetch-pipeline-public-config'

/** 流水线公开快照（无需登录）：生效参数与规则书等，不含密钥；canEdit 恒为 false */
export async function GET() {
  const config = await getFetchPipelinePublicConfigPayload(null)
  return Response.json({ success: true, config })
}
