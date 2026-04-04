import { runRefreshProcessRawQueue } from '@/lib/services/process-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 与 process-service 一致：1–100，缺省 100 */
function parseCronRawLimit(request: Request): number | undefined {
  const raw = new URL(request.url).searchParams.get('limit')
  if (raw == null || raw === '') return undefined
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n)) return undefined
  return n
}

function cronSecretOk(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false

  const url = new URL(request.url)
  if (url.searchParams.get('secret') === secret) return true
  if (request.headers.get('x-cron-secret') === secret) return true
  const auth = request.headers.get('authorization')
  if (auth === `Bearer ${secret}`) return true
  return false
}

/**
 * Cron / 内部调度：跑与 POST /api/refresh/process 相同的批处理逻辑，但不占用 taskManager。
 * 需设置 CRON_SECRET；Vercel Cron 可在路径上带 ?secret= 或使用 Headers 注入（视平台而定）。
 */
async function handle(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    console.warn('[cron/process-jobs] CRON_SECRET 未配置，拒绝请求')
    return Response.json(
      { ok: false, error: 'CRON_SECRET not configured' },
      { status: 503 }
    )
  }

  if (!cronSecretOk(request)) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rawLimit = parseCronRawLimit(request)
    const result = await runRefreshProcessRawQueue({
      silent: true,
      ...(rawLimit !== undefined ? { rawLimit } : {}),
    })
    return Response.json({
      ok: true,
      taskId: result.taskId,
      message: result.message,
      count: result.count,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'process failed'
    console.error('[cron/process-jobs]', error)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
