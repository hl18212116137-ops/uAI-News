import 'server-only'

import { db } from '@/lib/db/drizzle'
import { userPipelineRules } from '@/lib/db/schema'
import { eq, and, asc, count, inArray, sql } from 'drizzle-orm'
import type { NewsItem } from '@/lib/types'
import { getFeedVisibleDaysEffective } from '@/lib/feed-window'

export const MAX_RULES_PER_MODULE = 40
export type PipelineRuleModule = 'recommendation'

export type UserPipelineRuleRow = {
  id: string
  userId: string
  module: string
  ruleType: string
  payload: Record<string, unknown>
  enabled: boolean
  createdAt: Date
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

export async function listRules(
  userId: string,
  module: PipelineRuleModule,
  options: { strict?: boolean } = {}
): Promise<UserPipelineRuleRow[]> {
  try {
    const rows = await db
      .select()
      .from(userPipelineRules)
      .where(and(eq(userPipelineRules.userId, userId), eq(userPipelineRules.module, module)))
      .orderBy(asc(userPipelineRules.createdAt))
    return rows as UserPipelineRuleRow[]
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (options.strict) throw err
    console.warn('[user-pipeline-rules] list:', msg)
    return []
  }
}

/** 用户为推荐流设置的「最近 N 天」；未设置则返回 null（用全站窗口） */
export async function getUserRecommendationVisibleDays(userId: string): Promise<number | null> {
  const rules = await listRules(userId, 'recommendation')
  const row = rules.find((r) => r.enabled && r.ruleType === 'recommendation_visible_days')
  if (!row) return null
  const d = Number((row.payload as Record<string, unknown>).days)
  if (!Number.isFinite(d)) return null
  return Math.floor(d)
}

export async function deleteRule(userId: string, ruleId: string): Promise<boolean> {
  const deleted = await db
    .delete(userPipelineRules)
    .where(and(eq(userPipelineRules.id, ruleId), eq(userPipelineRules.userId, userId)))
    .returning({ id: userPipelineRules.id })

  return deleted.length > 0
}

export async function createRule(
  userId: string,
  module: PipelineRuleModule,
  ruleType: string,
  payload: Record<string, unknown>
): Promise<UserPipelineRuleRow> {
  return db.transaction(async (tx) => {
    // Serialize this user's edits so concurrent saves cannot exceed the limit
    // or leave two competing reading windows. Failure preserves the old value.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${module}`}))`)
    const owner = and(eq(userPipelineRules.userId, userId), eq(userPipelineRules.module, module))
    if (ruleType === 'recommendation_visible_days') {
      await tx.delete(userPipelineRules).where(and(owner, eq(userPipelineRules.ruleType, ruleType)))
    }
    const [total] = await tx.select({ count: count() }).from(userPipelineRules).where(and(
      owner,
      inArray(userPipelineRules.ruleType, ['recommendation_visible_days', 'hide_if_contains', 'prefer_keyword'])
    ))
    if (total.count >= MAX_RULES_PER_MODULE) throw new Error(`最多保存 ${MAX_RULES_PER_MODULE} 项阅读偏好，请先删除一项`)
    const [row] = await tx.insert(userPipelineRules).values({ userId, module, ruleType, payload, enabled: true }).returning()
    if (!row) throw new Error('[reading-preferences] insert returned no rows')
    return row as UserPipelineRuleRow
  })
}

function haystackForRecommendation(p: NewsItem): string {
  return `${p.title}\n${p.summary}`.toLowerCase()
}

/**
 * 推荐流：先按 hide 过滤，再按 prefer_keyword 稳定排序（不处理 recommendation_visible_days，该在查询 published_at 下界时使用）。
 */
export async function applyRecommendationToPosts(userId: string, posts: NewsItem[]): Promise<NewsItem[]> {
  const rules = await listRules(userId, 'recommendation')
  if (rules.length === 0) return posts

  let out = [...posts]

  for (const r of rules) {
    if (!r.enabled) continue
    if (r.ruleType === 'recommendation_visible_days') continue
    const p = r.payload || {}
    if (r.ruleType === 'hide_if_contains') {
      const sub = norm(String(p.substring ?? ''))
      if (!sub) continue
      out = out.filter((item) => !haystackForRecommendation(item).includes(sub))
    }
  }

  const preferKeywords = rules
    .filter((r) => r.enabled && r.ruleType === 'prefer_keyword')
    .map((r) => norm(String((r.payload as Record<string, unknown>).keyword ?? '')))
    .filter(Boolean)

  if (preferKeywords.length === 0) return out

  const scored = out.map((item, idx) => {
    const h = haystackForRecommendation(item)
    const boost = preferKeywords.some((k) => h.includes(k)) ? 1 : 0
    return { item, idx, boost }
  })

  scored.sort((a, b) => {
    if (b.boost !== a.boost) return b.boost - a.boost
    const ta = new Date(a.item.publishedAt).getTime()
    const tb = new Date(b.item.publishedAt).getTime()
    if (tb !== ta) return tb - ta
    return a.idx - b.idx
  })

  return scored.map((s) => s.item)
}

/** 将用户填写的天数限制在全站 feed 窗口内 */
export function clampRecommendationVisibleDays(days: number): number {
  const cap = getFeedVisibleDaysEffective()
  return Math.min(cap, Math.max(1, Math.floor(days)))
}
