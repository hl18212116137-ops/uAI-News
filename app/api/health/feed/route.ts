import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/drizzle'

function aiKeyConfigured(): boolean {
  const provider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase()
  if (provider === 'minimax') return Boolean(process.env.MINIMAX_API_KEY?.trim())
  if (provider === 'claude') return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim() || process.env.MINIMAX_API_KEY?.trim())
}

/**
 * GET /api/health/feed
 * 诊断信息流：X API、AI 密钥、库内真实推文数量
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {}

  checks.twitter_api = {
    ok: Boolean(process.env.TWITTERAPI_IO_KEY?.trim()),
    detail: process.env.TWITTERAPI_IO_KEY?.trim()
      ? undefined
      : '未设置 TWITTERAPI_IO_KEY，无法抓取 X 推文',
  }

  checks.ai_provider = {
    ok: aiKeyConfigured(),
    detail: aiKeyConfigured()
      ? `AI_PROVIDER=${process.env.AI_PROVIDER || 'deepseek'}`
      : '未配置 AI 密钥（DEEPSEEK_API_KEY / MINIMAX_API_KEY / ANTHROPIC_API_KEY），无法生成中文标题摘要',
  }

  if (process.env.DATABASE_URL) {
    try {
      const [sourcesRes, postsRes, rawRes] = await Promise.all([
        pool.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM sources WHERE enabled = true"
        ),
        pool.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM news_items WHERE id LIKE 'x-%'"
        ),
        pool.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM raw_posts WHERE status IN ('new', 'pending')"
        ),
      ])
      const sourceCount = sourcesRes.rows[0]?.count ?? '0'
      const realPosts = postsRes.rows[0]?.count ?? '0'
      const pendingRaw = rawRes.rows[0]?.count ?? '0'
      checks.database_sources = { ok: Number(sourceCount) > 0, detail: `已启用信息源 ${sourceCount} 个` }
      checks.database_real_posts = {
        ok: Number(realPosts) > 0,
        detail:
          Number(realPosts) > 0
            ? `真实推文（x-*）${realPosts} 条`
            : '尚无真实推文，请登录后点「抓取更新」或等待自动补抓',
      }
      checks.raw_queue = {
        ok: true,
        detail: `待 AI 处理的 raw_posts：${pendingRaw} 条`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      checks.database_feed = { ok: false, detail: message }
    }
  } else {
    checks.database_feed = { ok: false, detail: '跳过：无 DATABASE_URL' }
  }

  const ok =
    checks.twitter_api.ok &&
    checks.ai_provider.ok &&
    (checks.database_real_posts?.ok ?? false)

  return NextResponse.json(
    {
      ok,
      checks,
      hint: ok
        ? '信息流依赖正常。若列表仍空，请点顶栏「抓取更新」或稍等自动补抓完成。'
        : '首页若为空属正常：需配置 TWITTERAPI_IO_KEY 与 AI 密钥后抓取，已关闭英文 demo 占位帖。',
    },
    { status: ok ? 200 : 503 }
  )
}
