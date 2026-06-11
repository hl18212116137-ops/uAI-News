import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/drizzle'

/**
 * GET /api/health/auth
 * 诊断登录依赖：NEXTAUTH_SECRET、DATABASE_URL、users 表是否可访问
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {}

  checks.nextauth_secret = {
    ok: Boolean(process.env.NEXTAUTH_SECRET),
    detail: process.env.NEXTAUTH_SECRET ? undefined : '未设置 NEXTAUTH_SECRET',
  }

  checks.database_url = {
    ok: Boolean(process.env.DATABASE_URL),
    detail: process.env.DATABASE_URL ? undefined : '未设置 DATABASE_URL',
  }

  checks.nextauth_url = {
    ok: Boolean(process.env.NEXTAUTH_URL),
    detail: process.env.NEXTAUTH_URL
      ? undefined
      : '未设置 NEXTAUTH_URL（本地开发建议 http://localhost:3000）',
  }

  if (process.env.DATABASE_URL) {
    try {
      const result = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM users'
      )
      checks.database_users = { ok: true, detail: `users 表可访问（${result.rows[0]?.count ?? 0} 个账号）` }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      checks.database_users = { ok: false, detail: message }
    }
  } else {
    checks.database_users = { ok: false, detail: '跳过：无 DATABASE_URL' }
  }

  const ok = Object.values(checks).every((c) => c.ok)

  return NextResponse.json(
    {
      ok,
      checks,
      hint: ok
        ? '认证依赖正常，若仍无法登录请检查邮箱密码或访问地址是否与 NEXTAUTH_URL 主机一致（localhost vs 127.0.0.1）。'
        : '请先修复上述检查项，修改 .env.local 后重启 npm run dev。',
    },
    { status: ok ? 200 : 503 }
  )
}
