import 'server-only'

import { db } from '@/lib/db/drizzle'
import { processingJobs } from '@/lib/db/schema'
import { eq, and, inArray, asc } from 'drizzle-orm'

export type ProcessingJobRow = {
  id: string
  rawPostId: string | null
  newsItemId: string | null
  jobType: string
  status: string
  attempts: number
  lastError: string | null
  lockedAt: Date | null
  lockedBy: string | null
  createdAt: Date
  updatedAt: Date
}

export async function listPendingProcessingJobs(limit: number): Promise<ProcessingJobRow[]> {
  return db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.status, 'pending'))
    .orderBy(asc(processingJobs.createdAt))
    .limit(limit)
}

/** 乐观锁：仅当仍为 pending 时改为 processing */
export async function claimProcessingJob(jobId: string): Promise<boolean> {
  const rows = await db
    .update(processingJobs)
    .set({
      status: 'processing',
      lockedAt: new Date(),
    })
    .where(and(eq(processingJobs.id, jobId), eq(processingJobs.status, 'pending')))
    .returning({ id: processingJobs.id })

  return rows.length > 0
}

export async function markProcessingJobDone(jobId: string): Promise<void> {
  await db
    .update(processingJobs)
    .set({ status: 'done', lastError: null })
    .where(eq(processingJobs.id, jobId))
}

export async function markProcessingJobFailed(
  jobId: string,
  message: string,
  attemptsIncrement: number
): Promise<void> {
  await db
    .update(processingJobs)
    .set({
      status: 'failed',
      lastError: message.slice(0, 2000),
      attempts: attemptsIncrement,
    })
    .where(eq(processingJobs.id, jobId))
}

/**
 * 为每条新 raw 插入 full_pipeline pending；已存在 pending/processing 的同 raw_post_id 则跳过
 */
export async function enqueueFullPipelineJobsForRawIds(rawIds: string[]): Promise<void> {
  if (rawIds.length === 0) return

  const existing = await db
    .select({ rawPostId: processingJobs.rawPostId })
    .from(processingJobs)
    .where(
      and(
        inArray(processingJobs.rawPostId, rawIds),
        inArray(processingJobs.status, ['pending', 'processing'])
      )
    )

  const taken = new Set(existing.map(r => r.rawPostId).filter(Boolean))

  const rows = rawIds
    .filter(id => !taken.has(id))
    .map(rawPostId => ({
      rawPostId,
      jobType: 'full_pipeline' as const,
      status: 'pending' as const,
    }))

  if (rows.length === 0) return

  await db.insert(processingJobs).values(rows)
}

/** 仍有 pending/processing 任务占用的 raw id（legacy 扫描需跳过） */
export async function fetchRawPostIdsWithActiveJobs(): Promise<Set<string>> {
  const data = await db
    .select({ rawPostId: processingJobs.rawPostId })
    .from(processingJobs)
    .where(inArray(processingJobs.status, ['pending', 'processing']))

  return new Set(
    data.map(r => r.rawPostId).filter(Boolean) as string[]
  )
}

/** 导入 / 去重：避免对已排队 raw 重复打 X API */
export async function hasPendingOrProcessingJobForRawPostId(
  rawPostId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: processingJobs.id })
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.rawPostId, rawPostId),
        inArray(processingJobs.status, ['pending', 'processing'])
      )
    )
    .limit(1)

  return rows.length > 0
}
