import 'server-only'

import type { AuthUser } from '@/lib/auth'
type User = AuthUser

function parseList(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 站点流水线配置可写权限：PIPELINE_ADMIN_EMAILS / PIPELINE_ADMIN_USER_IDS（逗号分隔）。
 * 未配置时无人可写（canEdit 恒为 false）。
 */
export function isPipelineAdmin(user: Pick<User, 'id' | 'email'> | null | undefined): boolean {
  if (!user) return false
  const emails = parseList(process.env.PIPELINE_ADMIN_EMAILS)
  const ids = parseList(process.env.PIPELINE_ADMIN_USER_IDS)
  if (emails.length === 0 && ids.length === 0) return false
  if (ids.includes(user.id)) return true
  const em = user.email?.trim().toLowerCase()
  if (em && emails.map((e) => e.toLowerCase()).includes(em)) return true
  return false
}
