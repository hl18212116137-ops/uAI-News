import 'server-only'

import { supabase } from '@/lib/supabase'
import { fetchRawPostIdsWithActiveJobs } from '@/lib/db/processing-jobs'

/** 与 refresh/fetch、process 当前行为一致：仅 id 列 */
export async function fetchExistingRawPostIds(): Promise<string[]> {
  const { data: existingRaw } = await supabase.from('raw_posts').select('id')
  return (existingRaw || []).map((p: { id: string }) => p.id)
}

export async function fetchExistingNewsSourceUrls(): Promise<string[]> {
  const { data: existingNews } = await supabase.from('news_items').select('source_url')
  return (existingNews || []).map((p: { source_url: string }) => p.source_url)
}

export async function upsertRawPosts(rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await supabase.from('raw_posts').upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

export async function fetchRawPostsBatch(limit: number): Promise<Record<string, unknown>[]> {
  const { data: rawPosts, error: fetchError } = await supabase
    .from('raw_posts')
    .select('*')
    .limit(limit)

  if (fetchError) throw fetchError
  return rawPosts || []
}

export async function deleteRawPostById(id: string): Promise<void> {
  const { error } = await supabase.from('raw_posts').delete().eq('id', id)
  if (error) throw error
}

export async function fetchRawPostById(id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from('raw_posts').select('*').eq('id', id).maybeSingle()

  if (error) throw error
  return data as Record<string, unknown> | null
}

const LEGACY_RAW_SCAN_CAP_DEFAULT = 500
const LEGACY_RAW_SCAN_CAP_MAX = 800

/**
 * 拉取 raw_posts，排除仍有 pending/processing job 的行（避免与 job 路径双消费）
 * @param scanCap 最多扫描行数（随 take 略调，减轻小批次时的全表头扫描）
 */
export async function fetchRawPostsExcludingActiveJobs(
  take: number,
  scanCap = Math.min(
    LEGACY_RAW_SCAN_CAP_MAX,
    Math.max(LEGACY_RAW_SCAN_CAP_DEFAULT, take * 6)
  )
): Promise<Record<string, unknown>[]> {
  const block = await fetchRawPostIdsWithActiveJobs()
  const { data: raws, error } = await supabase.from('raw_posts').select('*').limit(scanCap)

  if (error) throw error
  const list = (raws || []) as Record<string, unknown>[]
  return list.filter(r => !block.has(r.id as string)).slice(0, take)
}
