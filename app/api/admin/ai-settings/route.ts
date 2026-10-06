import { requirePipelineAdmin } from '@/lib/pipeline-admin'
import { aiSettingsInputSchema, mergeAISettings, publicAISettings, resolveAISettings } from '@/lib/ai/config'
import { readAISettings, resetAISettings, saveAISettings } from '@/lib/ai/settings'
import { requestAIText } from '@/lib/ai/request'

export const dynamic = 'force-dynamic'
export const maxDuration = 90
const headers = { 'Cache-Control': 'no-store' }

export async function GET() {
  const { errorResponse } = await requirePipelineAdmin()
  if (errorResponse) return errorResponse
  try { return Response.json({ success: true, settings: publicAISettings(await readAISettings()) }, { headers }) }
  catch { return Response.json({ success: false, error: 'AI 配置无法读取，请检查服务状态' }, { status: 503, headers }) }
}

export async function PUT(request: Request) {
  const { errorResponse } = await requirePipelineAdmin()
  if (errorResponse) return errorResponse
  const parsed = aiSettingsInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ success: false, error: '请选择正确的服务商、接口、模型和超时时间' }, { status: 400, headers })
  try {
    await saveAISettings(parsed.data)
    return Response.json({ success: true, settings: publicAISettings(await readAISettings()) }, { headers })
  } catch (error) { return Response.json({ success: false, error: error instanceof Error ? error.message : '配置保存失败' }, { status: 503, headers }) }
}

/** Test the selected connection directly; never let fallback hide an invalid key. */
export async function POST(request: Request) {
  const { errorResponse } = await requirePipelineAdmin()
  if (errorResponse) return errorResponse
  const parsed = aiSettingsInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ success: false, error: '连接参数无效' }, { status: 400, headers })
  try {
    const { connections } = resolveAISettings(mergeAISettings(await readAISettings(), parsed.data))
    const start = Date.now()
    await requestAIText(connections[parsed.data.provider], '请只回复 OK，用于验证接口连接。')
    return Response.json({ success: true, message: `${parsed.data.provider} 连接成功（${((Date.now() - start) / 1000).toFixed(1)} 秒）` }, { headers })
  } catch (error) { return Response.json({ success: false, error: error instanceof Error ? error.message : '连接失败' }, { status: 502, headers }) }
}

export async function DELETE() {
  const { errorResponse } = await requirePipelineAdmin()
  if (errorResponse) return errorResponse
  try {
    await resetAISettings()
    return Response.json({ success: true, settings: publicAISettings(null) }, { headers })
  } catch { return Response.json({ success: false, error: '恢复部署配置失败' }, { status: 503, headers }) }
}
