import 'server-only'

import { taskManager } from '@/lib/task-manager'
import { getDefaultAIService } from '@/lib/ai/ai-factory'
import {
  addPost,
  mediaUrlsFromDbJson,
  mergeInsightGlobalPayload,
  normalizeNewsItemId,
  referencedPostFromDbJson,
  socialEngagementFromDbJson,
} from '@/lib/db/news'
import {
  claimProcessingJob,
  listPendingProcessingJobs,
  markProcessingJobDone,
  markProcessingJobFailed,
  type ProcessingJobRow,
} from '@/lib/db/processing-jobs'
import {
  deleteRawPostById,
  fetchRawPostById,
  fetchRawPostsBatch,
  fetchRawPostsExcludingActiveJobs,
} from '@/lib/db/raw-posts'
import { isProcessingJobsPipelineEnabled } from '@/lib/processing-jobs-pipeline'
import { computeInsightAnalysis } from '@/lib/post-insight-compute'
import { shouldSkipLowSignalRawPost } from '@/lib/raw-post-quality'
import { NewsItem, NewsCategory } from '@/lib/types'
import { translateNewsOriginalToChinese } from '@/lib/news-original-chinese'
import { composeTextForAiProcessing } from '@/lib/x'

export type RefreshProcessResult = {
  success: true
  taskId: string
  message: string
  count: number
}

const BATCH_SIZE = 5
const RAW_LIMIT_DEFAULT = 100
const RAW_LIMIT_MAX = 100
const RAW_LIMIT_MIN = 1

const CRON_TASK_ID = 'cron'

function isUserRefreshCancelled(taskId: string, silent: boolean): boolean {
  if (silent || taskId === CRON_TASK_ID) return false
  return taskManager.getTask(taskId)?.status === 'cancelled'
}

function clampProcessRawLimit(rawLimit?: number): number {
  if (rawLimit == null || !Number.isFinite(rawLimit)) return RAW_LIMIT_DEFAULT
  return Math.min(RAW_LIMIT_MAX, Math.max(RAW_LIMIT_MIN, Math.floor(rawLimit)))
}

function syncTask(
  silent: boolean,
  taskId: string,
  update: Parameters<typeof taskManager.updateTask>[1]
) {
  if (!silent) taskManager.updateTask(taskId, update)
}

type ProcessContext = {
  job?: ProcessingJobRow
  persistRawPostId: boolean
}

async function processOneRawPost(
  rawPost: Record<string, unknown>,
  ctx: ProcessContext
): Promise<void> {
  const aiService = getDefaultAIService()
  const id = rawPost.id as string
  const outerText = rawPost.text as string
  const referencedPost = referencedPostFromDbJson(rawPost.referenced_post)
  const text = composeTextForAiProcessing(outerText, referencedPost)
  const authorName = rawPost.author_name as string
  const handle = rawPost.handle as string
  const platform = rawPost.platform as string
  const url = rawPost.url as string
  const publishedAt = rawPost.published_at as string

  try {
    if (shouldSkipLowSignalRawPost(rawPost)) {
      await deleteRawPostById(id)
      if (ctx.job) await markProcessingJobDone(ctx.job.id)
      return
    }

    const aiResult = await aiService.processNews(text, authorName, handle)

    if (!aiResult.important) {
      await deleteRawPostById(id)
      if (ctx.job) await markProcessingJobDone(ctx.job.id)
      return
    }

    const [translatedContent, zhOriginal] = await Promise.all([
      aiService.translateContent(text),
      translateNewsOriginalToChinese((s) => aiService.translateContent(s), outerText, referencedPost),
    ])

    const mediaUrls = mediaUrlsFromDbJson(rawPost.media_urls)
    const socialEngagement = socialEngagementFromDbJson(rawPost.social_engagement)

    const newsItem: NewsItem = {
      id,
      title: aiResult.title,
      summary: aiResult.summary,
      content: translatedContent,
      source: {
        platform: platform as any,
        name: authorName,
        handle,
        url,
      },
      category: aiResult.category as NewsCategory,
      publishedAt,
      originalText: zhOriginal.originalText,
      createdAt: new Date().toISOString(),
      ...(mediaUrls ? { mediaUrls } : {}),
      ...(socialEngagement ? { socialEngagement } : {}),
      ...(zhOriginal.referencedPost ? { referencedPost: zhOriginal.referencedPost } : {}),
    }

    try {
      const score = await aiService.scoreNewsImportance({
        title: newsItem.title,
        summary: newsItem.summary,
        content: newsItem.content,
        category: newsItem.category,
        authorName,
        authorHandle: handle,
        publishedAt,
      })
      newsItem.importanceScore = score
    } catch {
      // 评分失败不影响保存
    }

    await addPost(newsItem, ctx.persistRawPostId ? { rawPostId: id } : undefined)

    const storedId = normalizeNewsItemId(String(id))
    try {
      const insight = await computeInsightAnalysis({
        postId: storedId,
        subscribedSourcesLines: '',
      })
      if (insight) await mergeInsightGlobalPayload(storedId, insight)
    } catch (insightErr) {
      console.warn(`[process] insight precompute skipped for ${storedId}`, insightErr)
    }

    await deleteRawPostById(id)
    if (ctx.job) await markProcessingJobDone(ctx.job.id)
  } catch (error) {
    console.error(`处理 ${id} 失败:`, error)
    const message = error instanceof Error ? error.message : String(error)
    if (ctx.job) {
      await markProcessingJobFailed(ctx.job.id, message, ctx.job.attempts + 1)
    }
  }
}

export type RunRefreshProcessBody = {
  taskId?: string
  /** true：不向 taskManager 写入（供 Cron / 内部调度） */
  silent?: boolean
  /** 本批最多处理条数（job 列队 + legacy raw 各受此上限约束），默认 100，范围 1–100 */
  rawLimit?: number
}

/**
 * raw_posts → AI → news_items（POST /api/refresh/process）
 * PROCESSING_JOBS_ENABLED=true 时：先消费 pending jobs，再处理「无活跃 job」的 legacy raw
 */
export async function runRefreshProcessRawQueue(
  body: RunRefreshProcessBody = {}
): Promise<RefreshProcessResult> {
  const silent = body.silent === true
  const taskId = silent ? CRON_TASK_ID : body.taskId || taskManager.createTask()
  const rawLimit = clampProcessRawLimit(body.rawLimit)

  if (!silent && body.taskId && isUserRefreshCancelled(body.taskId, silent)) {
    return { success: true, taskId: body.taskId, message: 'cancelled', count: 0 }
  }

  syncTask(silent, taskId, {
    status: 'running',
    progress: 40,
    message: '正在 AI 处理推文...',
    startTime: Date.now(),
  })

  const useJobs = isProcessingJobsPipelineEnabled()
  const persistRawPostId = useJobs

  if (!useJobs) {
    const rawPosts = await fetchRawPostsBatch(rawLimit)

    if (rawPosts.length === 0) {
      syncTask(silent, taskId, {
        status: 'completed',
        progress: 100,
        message: '没有原始推文需要处理',
      })
      return { success: true, taskId, message: '没有推文需要处理', count: 0 }
    }

    const total = rawPosts.length
    let processed = 0

    for (let i = 0; i < rawPosts.length; i += BATCH_SIZE) {
      if (isUserRefreshCancelled(taskId, silent)) {
        return { success: true, taskId, message: 'cancelled', count: processed }
      }
      const batch = rawPosts.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(
        batch.map(raw => processOneRawPost(raw, { persistRawPostId: false }))
      )
      processed += batch.length
      syncTask(silent, taskId, {
        progress: 40 + Math.round((processed / total) * 60),
        message: `已处理 ${processed}/${total} 条推文`,
      })
    }

    if (isUserRefreshCancelled(taskId, silent)) {
      return { success: true, taskId, message: 'cancelled', count: processed }
    }

    syncTask(silent, taskId, {
      status: 'completed',
      progress: 100,
      message: `处理完成：${processed} 条推文`,
    })

    return {
      success: true,
      taskId,
      message: '处理完成',
      count: processed,
    }
  }

  const [pending, legacyRaw] = await Promise.all([
    listPendingProcessingJobs(rawLimit),
    fetchRawPostsExcludingActiveJobs(rawLimit),
  ])
  const totalWork = pending.length + legacyRaw.length

  if (totalWork === 0) {
    syncTask(silent, taskId, {
      status: 'completed',
      progress: 100,
      message: '没有原始推文需要处理',
    })
    return { success: true, taskId, message: '没有推文需要处理', count: 0 }
  }

  let idx = 0
  const bumpProgress = () => {
    idx++
    syncTask(silent, taskId, {
      progress: 40 + Math.round((idx / totalWork) * 60),
      message: `已处理 ${idx}/${totalWork} 条推文`,
    })
  }

  for (const job of pending) {
    if (isUserRefreshCancelled(taskId, silent)) {
      return { success: true, taskId, message: 'cancelled', count: idx }
    }
    const claimed = await claimProcessingJob(job.id)
    if (!claimed) {
      bumpProgress()
      continue
    }

    if (!job.raw_post_id) {
      await markProcessingJobFailed(job.id, 'missing_raw_post_id', job.attempts + 1)
      bumpProgress()
      continue
    }

    const raw = await fetchRawPostById(job.raw_post_id)
    if (!raw) {
      await markProcessingJobFailed(job.id, 'raw_missing', job.attempts + 1)
      bumpProgress()
      continue
    }

    await processOneRawPost(raw, { job, persistRawPostId })
    bumpProgress()
  }

  for (let i = 0; i < legacyRaw.length; i += BATCH_SIZE) {
    if (isUserRefreshCancelled(taskId, silent)) {
      return { success: true, taskId, message: 'cancelled', count: idx }
    }
    const batch = legacyRaw.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(
      batch.map(raw => processOneRawPost(raw, { persistRawPostId }))
    )
    for (let j = 0; j < batch.length; j++) bumpProgress()
  }

  if (isUserRefreshCancelled(taskId, silent)) {
    return { success: true, taskId, message: 'cancelled', count: idx }
  }

  syncTask(silent, taskId, {
    status: 'completed',
    progress: 100,
    message: `处理完成：${idx} 条推文`,
  })

  return {
    success: true,
    taskId,
    message: '处理完成',
    count: idx,
  }
}
