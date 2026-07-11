import 'server-only'

import { db } from '@/lib/db/drizzle'
import { userPipelineRules } from '@/lib/db/schema'
import { eq, and, asc, count, inArray } from 'drizzle-orm'
import type { NewsItem } from '@/lib/types'
import { getFeedVisibleDaysEffective } from '@/lib/feed-window'

export const MAX_RULES_PER_MODULE = 40
export const MAX_PAYLOAD_STRING_LEN = 200

export const PIPELINE_RULE_MODULES = [
  'sources',
  'dedupe',
  'raw',
  'quality',
  'ai',
  'feed',
  'recommendation',
] as const

export type PipelineRuleModule = (typeof PIPELINE_RULE_MODULES)[number]

export type UserPipelineRuleRow = {
  id: string
  userId: string
  module: string
  ruleType: string
  payload: Record<string, unknown>
  enabled: boolean
  createdAt: Date
}

const RECOMMENDATION_TYPES = [
  'hide_if_contains',
  'prefer_keyword',
  'recommendation_visible_days',
] as const

const GENERAL_TYPES = [
  'plain_rule',
  'disable_builtin_rule',
] as const

export type RecommendationRuleType = (typeof RECOMMENDATION_TYPES)[number]
export type GeneralPipelineRuleType = (typeof GENERAL_TYPES)[number]

function norm(s: string): string {
  return s.trim().toLowerCase()
}

export async function countRulesForModule(userId: string, module: PipelineRuleModule): Promise<number> {
  try {
    const rows = await db
      .select({ count: count() })
      .from(userPipelineRules)
      .where(and(eq(userPipelineRules.userId, userId), eq(userPipelineRules.module, module)))
    return rows[0]?.count ?? 0
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[user-pipeline-rules] count:', msg)
    return 0
  }
}

export async function listRules(
  userId: string,
  module: PipelineRuleModule
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
    console.warn('[user-pipeline-rules] list:', msg)
    return []
  }
}

export async function listRulesForModules(
  userId: string,
  modules: PipelineRuleModule[] = [...PIPELINE_RULE_MODULES]
): Promise<UserPipelineRuleRow[]> {
  try {
    const rows = await db
      .select()
      .from(userPipelineRules)
      .where(and(eq(userPipelineRules.userId, userId), inArray(userPipelineRules.module, modules)))
      .orderBy(asc(userPipelineRules.createdAt))
    return rows as UserPipelineRuleRow[]
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[user-pipeline-rules] list modules:', msg)
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

async function deleteRecommendationVisibleDaysRules(userId: string): Promise<void> {
  try {
    await db
      .delete(userPipelineRules)
      .where(
        and(
          eq(userPipelineRules.userId, userId),
          eq(userPipelineRules.module, 'recommendation'),
          eq(userPipelineRules.ruleType, 'recommendation_visible_days')
        )
      )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[user-pipeline-rules] delete visible days:', msg)
  }
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
  if (ruleType === 'recommendation_visible_days') {
    await deleteRecommendationVisibleDaysRules(userId)
    const cnt = await countRulesForModule(userId, module)
    if (cnt >= MAX_RULES_PER_MODULE) {
      throw new Error(`每个模块最多 ${MAX_RULES_PER_MODULE} 条规则，请先删除一条再设可见天数`)
    }
  } else {
    const n = await countRulesForModule(userId, module)
    if (n >= MAX_RULES_PER_MODULE) {
      throw new Error(`每个模块最多 ${MAX_RULES_PER_MODULE} 条规则`)
    }
  }

  const rows = await db
    .insert(userPipelineRules)
    .values({
      userId,
      module,
      ruleType,
      payload,
      enabled: true,
    })
    .returning()

  if (!rows[0]) throw new Error('[user-pipeline-rules] insert returned no rows')
  return rows[0] as UserPipelineRuleRow
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

export function isValidRuleTypeForModule(module: PipelineRuleModule, ruleType: string): boolean {
  if ((GENERAL_TYPES as readonly string[]).includes(ruleType)) return true
  if (module !== 'recommendation') return false
  return (RECOMMENDATION_TYPES as readonly string[]).includes(ruleType)
}

export function isPipelineRuleModule(module: string | null): module is PipelineRuleModule {
  return Boolean(module && (PIPELINE_RULE_MODULES as readonly string[]).includes(module))
}

/** 将用户填写的天数限制在全站 feed 窗口内 */
export function clampRecommendationVisibleDays(days: number): number {
  const cap = getFeedVisibleDaysEffective()
  return Math.min(cap, Math.max(1, Math.floor(days)))
}

export { GENERAL_TYPES, RECOMMENDATION_TYPES }
