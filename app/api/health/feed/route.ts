import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/drizzle'
import { RAW_POST_PROCESSABLE_STATUS_VALUES } from '@/lib/raw-post-queue'

type CountRow = {
  count: string
}

type QueueMetricRow = CountRow & {
  oldest_at: string | Date | null
}

type FeedHealthCheck = {
  ok: boolean
  detail?: string
}

type FeedQueueHealth = {
  rawQueuePending: number
  processingJobsPending: number
  totalPending: number
  oldestPendingAgeMinutes: number | null
}

function aiKeyConfigured(): boolean {
  const provider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase()
  if (provider === 'minimax') return Boolean(process.env.MINIMAX_API_KEY?.trim())
  if (provider === 'claude') return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim() || process.env.MINIMAX_API_KEY?.trim())
}

function countValue(row: CountRow | undefined): number {
  const n = Number(row?.count ?? 0)
  return Number.isFinite(n) ? n : 0
}

function ageMinutes(value: string | Date | null | undefined): number | null {
  if (!value) return null
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.round((Date.now() - ms) / 60000))
}

function combineOldestAge(
  rawOldest: string | Date | null | undefined,
  jobOldest: string | Date | null | undefined
): number | null {
  const rawAge = ageMinutes(rawOldest)
  const jobAge = ageMinutes(jobOldest)
  if (rawAge == null) return jobAge
  if (jobAge == null) return rawAge
  return Math.max(rawAge, jobAge)
}

function emptyQueue(): FeedQueueHealth {
  return {
    rawQueuePending: 0,
    processingJobsPending: 0,
    totalPending: 0,
    oldestPendingAgeMinutes: null,
  }
}

export async function GET() {
  const checks: Record<string, FeedHealthCheck> = {}

  checks.twitter_api = {
    ok: Boolean(process.env.TWITTERAPI_IO_KEY?.trim()),
    detail: process.env.TWITTERAPI_IO_KEY?.trim()
      ? undefined
      : '未配置 TWITTERAPI_IO_KEY，无法抓取 X 推文',
  }

  checks.ai_provider = {
    ok: aiKeyConfigured(),
    detail: aiKeyConfigured()
      ? `AI_PROVIDER=${process.env.AI_PROVIDER || 'deepseek'}`
      : '未配置 AI 密钥，无法生成中文标题摘要',
  }

  if (!process.env.DATABASE_URL) {
    checks.database_feed = { ok: false, detail: '缺少 DATABASE_URL' }
    return NextResponse.json(
      {
        ok: false,
        checks,
        queue: emptyQueue(),
        ...emptyQueue(),
        hint: '信息流依赖不完整；请先检查 DATABASE_URL、TwitterAPI.io 和 AI provider 配置。',
      },
      { status: 503 }
    )
  }

  try {
    const [sourcesRes, postsRes, rawRes, jobsRes] = await Promise.all([
      pool.query<CountRow>("SELECT count(*)::text AS count FROM sources WHERE enabled = true"),
      pool.query<CountRow>("SELECT count(*)::text AS count FROM news_items WHERE id LIKE 'x-%'"),
      pool.query<QueueMetricRow>(
        "SELECT count(*)::text AS count, min(created_at) AS oldest_at FROM raw_posts WHERE status = ANY($1::text[])",
        [RAW_POST_PROCESSABLE_STATUS_VALUES]
      ),
      pool.query<QueueMetricRow>(
        "SELECT count(*)::text AS count, min(created_at) AS oldest_at FROM processing_jobs WHERE status = 'pending'"
      ),
    ])

    const sourceCount = countValue(sourcesRes.rows[0])
    const realPosts = countValue(postsRes.rows[0])
    const rawQueuePending = countValue(rawRes.rows[0])
    const processingJobsPending = countValue(jobsRes.rows[0])
    const totalPending = rawQueuePending + processingJobsPending
    const oldestPendingAgeMinutes = combineOldestAge(
      rawRes.rows[0]?.oldest_at,
      jobsRes.rows[0]?.oldest_at
    )
    const queue: FeedQueueHealth = {
      rawQueuePending,
      processingJobsPending,
      totalPending,
      oldestPendingAgeMinutes,
    }

    checks.database_sources = {
      ok: sourceCount > 0,
      detail: `已启用信息源 ${sourceCount} 个`,
    }
    checks.database_real_posts = {
      ok: realPosts > 0,
      detail:
        realPosts > 0
          ? `真实推文（x-*）${realPosts} 条`
          : '暂无真实推文，请登录后抓取或等待自动补抓',
    }
    checks.raw_queue = {
      ok: true,
      detail: `待处理队列：raw_posts ${rawQueuePending} 条，processing_jobs ${processingJobsPending} 条`,
    }
    checks.queue_latency = {
      ok: oldestPendingAgeMinutes == null || oldestPendingAgeMinutes < 180,
      detail:
        oldestPendingAgeMinutes == null
          ? '当前没有待处理队列'
          : `最早待处理内容已等待约 ${oldestPendingAgeMinutes} 分钟`,
    }

    const ok =
      checks.twitter_api.ok &&
      checks.ai_provider.ok &&
      checks.database_real_posts.ok

    return NextResponse.json(
      {
        ok,
        checks,
        queue,
        rawQueuePending,
        processingJobsPending,
        oldestPendingAgeMinutes,
        hint:
          totalPending > 0
            ? `信息流依赖正常；仍有 ${totalPending} 条待处理内容，刷新或后台任务会继续消化。`
            : '信息流依赖正常；当前没有待处理队列。',
      },
      { status: ok ? 200 : 503 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    checks.database_feed = { ok: false, detail: message }
    return NextResponse.json(
      {
        ok: false,
        checks,
        queue: emptyQueue(),
        ...emptyQueue(),
        hint: '数据库健康检查失败，请先查看服务端日志。',
      },
      { status: 503 }
    )
  }
}
