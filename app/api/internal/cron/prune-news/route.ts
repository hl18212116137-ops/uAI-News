import { deleteNewsItemsOlderThanRetention } from '@/lib/db/news'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
 * 按 NEWS_RETENTION_DAYS（默认 30）删除 published_at 过早的 news_items。
 * 鉴权与 process-jobs Cron 相同：CRON_SECRET。
 */
async function handle(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    console.warn('[cron/prune-news] CRON_SECRET 未配置，拒绝请求')
    return Response.json(
      { ok: false, error: 'CRON_SECRET not configured' },
      { status: 503 }
    )
  }

  if (!cronSecretOk(request)) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await deleteNewsItemsOlderThanRetention()
    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error ?? 'delete failed' },
        { status: 500 }
      )
    }
    return Response.json({
      ok: true,
      deleted: result.deleted,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'prune failed'
    console.error('[cron/prune-news]', error)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
