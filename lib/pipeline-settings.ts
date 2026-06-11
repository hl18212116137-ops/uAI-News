import 'server-only'

import type {
  PipelineEffectiveSettingsSnapshot,
  SettingValueSource,
} from '@/lib/fetch-pipeline-public-config.types'
import { db } from '@/lib/db/drizzle'
import { sitePipelineSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const SETTINGS_ROW_ID = 'default'

const CLAMP_LOW = 0
const CLAMP_HIGH = 500

export type SitePipelineSettingsRow = {
  id: string
  rawMinOuterChars: number | null
  rawMinNestedCharsRetweet: number | null
  ingestDedupeRssBlogMatchNewsUrl: boolean | null
  updatedAt?: Date | null
}

export type PipelineRuntimeValues = {
  rawMinOuterChars: number
  rawMinNestedCharsRetweet: number
  ingestDedupeRssBlogMatchNewsUrl: boolean
}

function envInt(name: string, fallback: number): number {
  const raw = parseInt(process.env[name] || String(fallback), 10)
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name]
  if (v == null || v === '') return fallback
  return v === 'true' || v === '1' || v.toLowerCase() === 'yes'
}

function clampInt(n: number): number {
  return Math.min(CLAMP_HIGH, Math.max(CLAMP_LOW, Math.floor(n)))
}

function sourceFromDb<T>(dbVal: T | null | undefined, envSource: boolean): SettingValueSource {
  if (dbVal != null && dbVal !== undefined) return 'db'
  return envSource ? 'env' : 'default'
}

async function fetchSettingsRow(): Promise<SitePipelineSettingsRow | null> {
  try {
    const rows = await db
      .select()
      .from(sitePipelineSettings)
      .where(eq(sitePipelineSettings.id, SETTINGS_ROW_ID))
      .limit(1)
    return rows[0] ?? null
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[pipeline-settings] read site_pipeline_settings:', msg)
    return null
  }
}

/**
 * 运行时用到的纯数值（ingest / process），每次调用读一次 DB。
 */
export async function getEffectivePipelineRuntimeValues(): Promise<PipelineRuntimeValues> {
  const row = await fetchSettingsRow()
  const envOuter = envInt('RAW_MIN_OUTER_CHARS', 12)
  const envNested = envInt('RAW_MIN_NESTED_CHARS_RETWEET', 35)
  const envRssUrl = envBool('INGEST_DEDUPE_RSS_BLOG_MATCH_NEWS_URL', false)

  const rawMinOuterChars = clampInt(
    row?.rawMinOuterChars != null ? row.rawMinOuterChars : envOuter
  )
  const rawMinNestedCharsRetweet = clampInt(
    row?.rawMinNestedCharsRetweet != null ? row.rawMinNestedCharsRetweet : envNested
  )
  const ingestDedupeRssBlogMatchNewsUrl =
    row?.ingestDedupeRssBlogMatchNewsUrl != null
      ? row.ingestDedupeRssBlogMatchNewsUrl
      : envRssUrl

  return {
    rawMinOuterChars,
    rawMinNestedCharsRetweet,
    ingestDedupeRssBlogMatchNewsUrl,
  }
}

function feedVisibleDaysSourced(): { value: number; source: SettingValueSource } {
  const feedRaw = parseInt(process.env.FEED_VISIBLE_DAYS || '7', 10)
  const hasEnv = process.env.FEED_VISIBLE_DAYS != null && process.env.FEED_VISIBLE_DAYS !== ''
  const value = Number.isFinite(feedRaw)
    ? Math.min(90, Math.max(1, feedRaw))
    : 7
  return { value, source: hasEnv ? 'env' : 'default' }
}

function fetchMaxPostsSourced(): { value: number | null; source: SettingValueSource } {
  const capRaw = process.env.FETCH_MAX_POSTS_PER_HANDLE_PER_RUN
  const hasEnv = capRaw != null && capRaw !== ''
  const capParsed = hasEnv ? parseInt(capRaw!, 10) : NaN
  if (Number.isFinite(capParsed) && capParsed > 0) {
    return { value: capParsed, source: 'env' }
  }
  return { value: null, source: hasEnv ? 'env' : 'default' }
}

function feedMinImportanceScoreSourced(): { value: number; source: SettingValueSource } {
  const raw = parseInt(process.env.FEED_MIN_IMPORTANCE_SCORE || '55', 10)
  const hasEnv =
    process.env.FEED_MIN_IMPORTANCE_SCORE != null &&
    process.env.FEED_MIN_IMPORTANCE_SCORE !== ''
  const value = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 55
  return { value, source: hasEnv ? 'env' : 'default' }
}

/**
 * API 展示：每项标注来自 DB / env / default。
 */
export async function getEffectivePipelineSettingsSnapshot(): Promise<PipelineEffectiveSettingsSnapshot> {
  const row = await fetchSettingsRow()
  const envOuter = envInt('RAW_MIN_OUTER_CHARS', 12)
  const envNested = envInt('RAW_MIN_NESTED_CHARS_RETWEET', 35)
  const envRssUrl = envBool('INGEST_DEDUPE_RSS_BLOG_MATCH_NEWS_URL', false)
  const hasEnvOuter = process.env.RAW_MIN_OUTER_CHARS != null && process.env.RAW_MIN_OUTER_CHARS !== ''
  const hasEnvNested =
    process.env.RAW_MIN_NESTED_CHARS_RETWEET != null &&
    process.env.RAW_MIN_NESTED_CHARS_RETWEET !== ''
  const hasEnvRss =
    process.env.INGEST_DEDUPE_RSS_BLOG_MATCH_NEWS_URL != null &&
    process.env.INGEST_DEDUPE_RSS_BLOG_MATCH_NEWS_URL !== ''

  const outerVal = clampInt(
    row?.rawMinOuterChars != null ? row.rawMinOuterChars : envOuter
  )
  const nestedVal = clampInt(
    row?.rawMinNestedCharsRetweet != null ? row.rawMinNestedCharsRetweet : envNested
  )
  const rssVal =
    row?.ingestDedupeRssBlogMatchNewsUrl != null
      ? row.ingestDedupeRssBlogMatchNewsUrl
      : envRssUrl

  return {
    rawMinOuterChars: {
      value: outerVal,
      source: sourceFromDb(row?.rawMinOuterChars, hasEnvOuter),
    },
    rawMinNestedCharsRetweet: {
      value: nestedVal,
      source: sourceFromDb(row?.rawMinNestedCharsRetweet, hasEnvNested),
    },
    ingestDedupeRssBlogMatchNewsUrl: {
      value: rssVal,
      source: sourceFromDb(row?.ingestDedupeRssBlogMatchNewsUrl, hasEnvRss),
    },
    feedVisibleDays: feedVisibleDaysSourced(),
    feedMinImportanceScore: feedMinImportanceScoreSourced(),
    fetchMaxPostsPerHandlePerRun: fetchMaxPostsSourced(),
  }
}

export type SitePipelineSettingsWrite = {
  rawMinOuterChars?: number | null
  rawMinNestedCharsRetweet?: number | null
  ingestDedupeRssBlogMatchNewsUrl?: boolean | null
}

/**
 * Upsert 站点配置；null 表示清除该列覆盖（回退 env）。未出现在 input 中的列保留库内原值。
 */
export async function upsertSitePipelineSettings(input: SitePipelineSettingsWrite): Promise<void> {
  const existing = await fetchSettingsRow()
  const now = new Date()

  const rawMinOuterChars =
    input.rawMinOuterChars !== undefined
      ? input.rawMinOuterChars == null
        ? null
        : clampInt(input.rawMinOuterChars)
      : (existing?.rawMinOuterChars ?? null)
  const rawMinNestedCharsRetweet =
    input.rawMinNestedCharsRetweet !== undefined
      ? input.rawMinNestedCharsRetweet == null
        ? null
        : clampInt(input.rawMinNestedCharsRetweet)
      : (existing?.rawMinNestedCharsRetweet ?? null)
  const ingestDedupeRssBlogMatchNewsUrl =
    input.ingestDedupeRssBlogMatchNewsUrl !== undefined
      ? input.ingestDedupeRssBlogMatchNewsUrl == null
        ? null
        : Boolean(input.ingestDedupeRssBlogMatchNewsUrl)
      : (existing?.ingestDedupeRssBlogMatchNewsUrl ?? null)

  await db
    .insert(sitePipelineSettings)
    .values({
      id: SETTINGS_ROW_ID,
      rawMinOuterChars,
      rawMinNestedCharsRetweet,
      ingestDedupeRssBlogMatchNewsUrl,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: sitePipelineSettings.id,
      set: {
        rawMinOuterChars,
        rawMinNestedCharsRetweet,
        ingestDedupeRssBlogMatchNewsUrl,
        updatedAt: now,
      },
    })
}
