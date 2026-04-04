import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchUserInfoFromX } from './x'

const DEFAULT_DELAY_MS = 1000

type SourceRow = {
  id: string
  handle: string
  avatar?: string | null
  description?: string | null
}

async function applyEnrichmentForSources(
  client: SupabaseClient,
  sources: SourceRow[],
  delayMs: number
): Promise<{ success: number; failed: number; skipped: number }> {
  let success = 0
  let failed = 0
  let skipped = 0

  for (const source of sources) {
    const needsAvatar = !source.avatar
    const needsDesc = !source.description
    if (!needsAvatar && !needsDesc) {
      skipped++
      continue
    }

    try {
      const userInfo = await fetchUserInfoFromX(source.handle)
      const updates: Record<string, string> = {}
      if (needsAvatar && userInfo.avatar) updates.avatar = userInfo.avatar
      if (needsDesc && userInfo.description) updates.description = userInfo.description

      if (Object.keys(updates).length === 0) {
        skipped++
      } else {
        const { error: updateError } = await client.from('sources').update(updates).eq('id', source.id)
        if (updateError) failed++
        else success++
      }
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
  client: SupabaseClient,
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

    const { data: rows, error } = await client
      .from('sources')
      .select('id, handle, platform, avatar, description')
      .in('handle', normalized)
      .in('platform', ['x', 'X'])

    if (error || !rows?.length) return { success: 0, failed: 0, skipped: normalized.length }

    const needWork = rows.filter((r: SourceRow & { platform?: string }) => !r.avatar || !r.description)
    if (needWork.length === 0) return { success: 0, failed: 0, skipped: rows.length }

    return applyEnrichmentForSources(client, needWork, delayMs)
  }

  let q = client
    .from('sources')
    .select('id, handle, platform, avatar, description')
    .in('platform', ['x', 'X'])
    .or('avatar.is.null,description.is.null')

  if (options?.limit != null) q = q.limit(options.limit)

  const { data: sources, error } = await q

  if (error) {
    console.error('enrichSourcesMissingProfile: query failed', error)
    return { success: 0, failed: 0, skipped: 0 }
  }

  if (!sources?.length) return { success: 0, failed: 0, skipped: 0 }

  return applyEnrichmentForSources(client, sources as SourceRow[], delayMs)
}
