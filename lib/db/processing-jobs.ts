import 'server-only'

import { supabase } from '@/lib/supabase'

export type ProcessingJobRow = {
  id: string
  raw_post_id: string | null
  news_item_id: string | null
  job_type: string
  status: string
  attempts: number
  last_error: string | null
  locked_at: string | null
  locked_by: string | null
  created_at: string
  updated_at: string
}

export async function listPendingProcessingJobs(limit: number): Promise<ProcessingJobRow[]> {
  const { data, error } = await supabase
    .from('processing_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw error
  return (data || []) as ProcessingJobRow[]
}

/** 乐观锁：仅当仍为 pending 时改为 processing */
export async function claimProcessingJob(jobId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('processing_jobs')
    .update({
      status: 'processing',
      locked_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[processing_jobs] claim failed:', error)
    return false
  }
  return !!data
}

export async function markProcessingJobDone(jobId: string): Promise<void> {
  const { error } = await supabase
    .from('processing_jobs')
    .update({ status: 'done', last_error: null })
    .eq('id', jobId)

  if (error) throw error
}

export async function markProcessingJobFailed(
  jobId: string,
  message: string,
  attemptsIncrement: number
): Promise<void> {
  const { error } = await supabase
    .from('processing_jobs')
    .update({
      status: 'failed',
      last_error: message.slice(0, 2000),
      attempts: attemptsIncrement,
    })
    .eq('id', jobId)

  if (error) throw error
}

/**
 * 为每条新 raw 插入 full_pipeline pending；已存在 pending/processing 的同 raw_post_id 则跳过
 */
export async function enqueueFullPipelineJobsForRawIds(rawIds: string[]): Promise<void> {
  if (rawIds.length === 0) return

  const { data: existing, error: exErr } = await supabase
    .from('processing_jobs')
    .select('raw_post_id')
    .in('raw_post_id', rawIds)
    .in('status', ['pending', 'processing'])

  if (exErr) throw exErr

  const taken = new Set(
    (existing || []).map((r: { raw_post_id: string | null }) => r.raw_post_id).filter(Boolean)
  )

  const rows = rawIds
    .filter(id => !taken.has(id))
    .map(raw_post_id => ({
      raw_post_id,
      job_type: 'full_pipeline' as const,
      status: 'pending' as const,
    }))

  if (rows.length === 0) return

  const { error } = await supabase.from('processing_jobs').insert(rows)
  if (error) throw error
}

/** 仍有 pending/processing 任务占用的 raw id（legacy 扫描需跳过） */
export async function fetchRawPostIdsWithActiveJobs(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('processing_jobs')
    .select('raw_post_id')
    .in('status', ['pending', 'processing'])

  if (error) throw error

  return new Set(
    (data || []).map((r: { raw_post_id: string | null }) => r.raw_post_id).filter(Boolean) as string[]
  )
}

/** 导入 / 去重：避免对已排队 raw 重复打 X API */
export async function hasPendingOrProcessingJobForRawPostId(
  rawPostId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('processing_jobs')
    .select('id')
    .eq('raw_post_id', rawPostId)
    .in('status', ['pending', 'processing'])
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('[processing_jobs] hasPendingOrProcessingJobForRawPostId:', error.message)
    return false
  }
  return !!data
}
