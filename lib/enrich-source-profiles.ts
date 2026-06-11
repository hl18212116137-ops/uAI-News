import { eq, and, inArray, or, isNull } from 'drizzle-orm'
import { fetchUserInfoFromX } from './x'
import { db } from '@/lib/db/drizzle'
import { sources } from '@/lib/db/schema'
import { resolveSourceProfile } from '@/lib/source-profile'

const DEFAULT_DELAY_MS = 1000

type SourceRow = {
  id: string
  handle: string
  platform?: string | null
  avatar?: string | null
  description?: string | null
}

function rowNeedsProfileWork(row: SourceRow): boolean {
  return !String(row.avatar ?? '').trim() || !String(row.description ?? '').trim()
}

async function applyEnrichmentForSources(
  rows: SourceRow[],
  delayMs: number
): Promise<{ success: number; failed: number; skipped: number }> {
  let success = 0
  let failed = 0
  let skipped = 0

  for (const source of rows) {
    if (!rowNeedsProfileWork(source)) {
      skipped++
      continue
    }

    let avatar = source.avatar
    let description = source.description

    try {
      const userInfo = await fetchUserInfoFromX(source.handle)
      if (userInfo.avatar?.trim()) avatar = userInfo.avatar
      if (userInfo.description?.trim()) description = userInfo.description
    } catch {
      // X API 失败时仍用本地兜底写入 DB
    }

    const resolved = resolveSourceProfile({
      handle: source.handle,
      platform: source.platform ?? 'X',
      avatar,
      description,
    })

    try {
      await db
        .update(sources)
        .set({
          avatar: resolved.avatar || null,
          description: resolved.description,
        })
        .where(eq(sources.id, source.id))
      success++
    } catch {
      failed++
    }

    await new Promise((r) => setTimeout(r, delayMs))
  }

  return { success, failed, skipped }
}

/**
 * 对指定 handle（或全表 X 源）补全 sources.avatar / description。
 * 限流：逐条请求 X API，条目间默认间隔 1s，不阻塞 SSR；供脚本或管理任务调用。
 */
export async function enrichSourcesMissingProfile(
  options?: {
    handles?: string[]
    delayMs?: number
    /** 未传 handles 时，最多处理多少条（避免一次跑全库过长） */
    limit?: number
  }
): Promise<{ success: number; failed: number; skipped: number }> {
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS

  if (options?.handles?.length) {
    const normalized = [...new Set(options.handles.map((h) => h.trim()).filter(Boolean))]
    if (normalized.length === 0) return { success: 0, failed: 0, skipped: 0 }

    let rows: SourceRow[]
    try {
      rows = await db
        .select({
          id: sources.id,
          handle: sources.handle,
          platform: sources.platform,
          avatar: sources.avatar,
          description: sources.description,
        })
        .from(sources)
        .where(
          and(
            inArray(sources.handle, normalized),
            inArray(sources.platform, ['x', 'X'])
          )
        )
    } catch {
      return { success: 0, failed: 0, skipped: normalized.length }
    }

    if (!rows.length) return { success: 0, failed: 0, skipped: normalized.length }

    const needWork = rows.filter(rowNeedsProfileWork)
    if (needWork.length === 0) return { success: 0, failed: 0, skipped: rows.length }

    return applyEnrichmentForSources(needWork, delayMs)
  }

  let query = db
    .select({
      id: sources.id,
      handle: sources.handle,
      platform: sources.platform,
      avatar: sources.avatar,
      description: sources.description,
    })
    .from(sources)
    .where(
      and(
        inArray(sources.platform, ['x', 'X']),
        or(isNull(sources.avatar), isNull(sources.description))
      )
    )

  if (options?.limit != null) {
    query = query.limit(options.limit) as typeof query
  }

  let rows: SourceRow[]
  try {
    rows = await query
  } catch (err: any) {
    console.error('enrichSourcesMissingProfile: query failed', err)
    return { success: 0, failed: 0, skipped: 0 }
  }

  if (!rows.length) return { success: 0, failed: 0, skipped: 0 }

  return applyEnrichmentForSources(rows, delayMs)
}

/** 不调用 X API，仅用本地兜底规则写回全库缺失的头像 / 简介 */
export async function backfillSourceProfilesLocal(): Promise<{ updated: number }> {
  let rows: SourceRow[]
  try {
    rows = await db
      .select({
        id: sources.id,
        handle: sources.handle,
        platform: sources.platform,
        avatar: sources.avatar,
        description: sources.description,
      })
      .from(sources)
  } catch {
    return { updated: 0 }
  }

  let updated = 0
  for (const row of rows) {
    const resolved = resolveSourceProfile({
      handle: row.handle,
      platform: row.platform ?? 'X',
      avatar: row.avatar,
      description: row.description,
    })
    const avatarChanged = String(row.avatar ?? '').trim() !== resolved.avatar
    const descChanged = String(row.description ?? '').trim() !== resolved.description
    if (!avatarChanged && !descChanged) continue

    try {
      await db
        .update(sources)
        .set({
          avatar: resolved.avatar || null,
          description: resolved.description,
        })
        .where(eq(sources.id, row.id))
      updated++
    } catch {
      /* 单条失败跳过 */
    }
  }

  return { updated }
}
