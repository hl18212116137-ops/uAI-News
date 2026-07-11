import 'server-only'

import { mergePipelineTelemetryToTask, taskManager } from '@/lib/task-manager'
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
import {
  getPersonalFilterLearningContextForUser as getFilterLearningContextForUser,
  recordPassedPostSafely,
} from '@/lib/db/pass-logs'
import { isProcessingJobsPipelineEnabled } from '@/lib/processing-jobs-pipeline'
import { getEffectivePipelineRuntimeValues } from '@/lib/pipeline-settings'
import { computeInsightAnalysis } from '@/lib/post-insight-compute'
import { getLowSignalRawPostPassReason, type LowSignalThresholds } from '@/lib/raw-post-quality'
import { NewsItem, NewsCategory } from '@/lib/types'
import { translateNewsOriginalToChinese } from '@/lib/news-original-chinese'
import { composeTextForAiProcessing } from '@/lib/x'
import { canonicalNewsIdForRawPost } from '@/lib/news-dedupe'
import {
  ensureChineseBody as ensureChineseBodyShared,
  ensureChineseTitleSummary as ensureChineseTitleSummaryShared,
} from '@/lib/translation-guard'
import {
  createLongformAutoBudget,
  maybeAttachAutoLongform,
  type LongformAutoBudget,
} from '@/lib/longform-auto'
import type { AIProcessedContent, AIService } from '@/lib/ai/ai-service'
import { isMostlyChinese } from '@/lib/text-locale'

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
export const PROCESS_RAW_BATCH_LIMIT = RAW_LIMIT_DEFAULT

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
  lowSignalThresholds: LowSignalThresholds
  userId?: string
  learningContextCache?: Map<string, Promise<string>>
  longformAutoBudget?: LongformAutoBudget
}

type ProcessOneResult = {
  outcome: 'low_signal' | 'unimportant' | 'success' | 'error'
  errorMessage?: string
}

function accumulateProcessOutcome(
  acc: {
    attempted: number
    success: number
    low: number
    unimportant: number
    errors: number
    samples: string[]
  },
  r: ProcessOneResult
) {
  acc.attempted++
  if (r.outcome === 'success') acc.success++
  else if (r.outcome === 'low_signal') acc.low++
  else if (r.outcome === 'unimportant') acc.unimportant++
  else {
    acc.errors++
    if (r.errorMessage && acc.samples.length < 3) acc.samples.push(r.errorMessage)
  }
}

async function ensureChineseTitleSummary(
  ai: AIService,
  draft: AIProcessedContent
): Promise<AIProcessedContent> {
  let { title, summary, ...rest } = draft
  if (title.trim() && !isMostlyChinese(title, 0.2)) {
    try {
      title = (
        await ai.translateContent(
          `将下面这句新闻标题译为简短简体中文标题（不要引号或「标题：」前缀）：\n${title}`
        )
      ).trim()
    } catch {
      /* 保持原文 */
    }
  }
  if (summary.trim() && !isMostlyChinese(summary, 0.12)) {
    try {
      summary = (
        await ai.translateContent(`将下面这段文字译为简体中文资讯摘要（一段话）：\n${summary}`)
      ).trim()
    } catch {
      /* 保持原文 */
    }
  }
  return { ...rest, title, summary }
}

async function ensureChineseBody(ai: AIService, body: string): Promise<string> {
  const t = body.trim()
  if (!t) return body
  if (isMostlyChinese(t, 0.1)) return body
  try {
    const again = (await ai.translateContent(t)).trim()
    if (isMostlyChinese(again, 0.08)) return again
  } catch {
    /* 保持首次译文 */
  }
  return body
}

function pushProcessTelemetry(
  silent: boolean,
  taskId: string,
  acc: {
    attempted: number
    success: number
    low: number
    unimportant: number
    errors: number
    samples: string[]
  }
) {
  if (silent) return
  mergePipelineTelemetryToTask(taskId, {
    processAttempted: acc.attempted,
    processSuccess: acc.success,
    droppedLowSignal: acc.low,
    droppedUnimportant: acc.unimportant,
    processErrors: acc.errors,
    errorsSample: acc.samples.length > 0 ? acc.samples : undefined,
  })
}

function getAiUnimportantPassReason(draft: AIProcessedContent): string {
  const explicit = draft.passReason?.trim()
  if (explicit) return explicit
  const summary = draft.summary?.trim()
  if (summary) return `AI 判定信息价值不足：${summary}`
  const title = draft.title?.trim()
  return title ? `AI 判定信息价值不足：${title}` : 'AI 判定为不值得入库的低价值内容。'
}

function learningCacheKey(handle: string): string {
  return handle.trim().replace(/^@+/, '').toLowerCase() || 'all'
}

async function getLearningContext(ctx: ProcessContext, handle: string): Promise<string> {
  if (!ctx.userId) return ''
  const key = learningCacheKey(handle)
  if (!ctx.learningContextCache) {
    return getFilterLearningContextForUser(ctx.userId, handle)
  }
  let promise = ctx.learningContextCache.get(key)
  if (!promise) {
    promise = getFilterLearningContextForUser(ctx.userId, handle)
    ctx.learningContextCache.set(key, promise)
  }
  return promise
}

async function processOneRawPost(
  rawPost: Record<string, unknown>,
  ctx: ProcessContext
): Promise<ProcessOneResult> {
  const aiService = getDefaultAIService()
  const rawId = String(rawPost.id ?? '')
  const id = canonicalNewsIdForRawPost(rawPost) || rawId
  const outerText = String(rawPost.text ?? '')
  const referencedPost = referencedPostFromDbJson(rawPost.referenced_post)
  const text = composeTextForAiProcessing(outerText, referencedPost)
  const authorName = String(rawPost.author_name ?? '')
  const handle = String(rawPost.handle ?? '')
  const platform = String(rawPost.platform ?? 'X')
  const url = String(rawPost.url ?? '')
  const publishedAt = String(rawPost.published_at ?? new Date().toISOString())
  const mediaUrls = mediaUrlsFromDbJson(rawPost.media_urls)
  const socialEngagement = socialEngagementFromDbJson(rawPost.social_engagement)

  try {
    const lowSignalReason = getLowSignalRawPostPassReason(rawPost, ctx.lowSignalThresholds)
    if (lowSignalReason) {
      await recordPassedPostSafely({
        id,
        url,
        sourcePlatform: platform,
        sourceName: authorName,
        sourceHandle: handle,
        content: outerText,
        passType: 'low_signal',
        passReason: lowSignalReason,
        publishedAt,
        mediaUrls,
        socialEngagement,
        referencedPost,
      })
      await deleteRawPostById(rawId)
      if (ctx.job) await markProcessingJobDone(ctx.job.id)
      return { outcome: 'low_signal' }
    }

    const filterLearningContext = await getLearningContext(ctx, handle)
    const aiDraft = await aiService.processNews(text, authorName, handle, filterLearningContext)

    if (!aiDraft.important) {
      await recordPassedPostSafely({
        id,
        url,
        sourcePlatform: platform,
        sourceName: authorName,
        sourceHandle: handle,
        content: outerText,
        title: aiDraft.title,
        summary: aiDraft.summary,
        category: aiDraft.category,
        passType: 'ai_unimportant',
        passReason: getAiUnimportantPassReason(aiDraft),
        publishedAt,
        mediaUrls,
        socialEngagement,
        referencedPost,
      })
      await deleteRawPostById(rawId)
      if (ctx.job) await markProcessingJobDone(ctx.job.id)
      return { outcome: 'unimportant' }
    }

    const aiResult = await ensureChineseTitleSummaryShared(aiService, aiDraft)

    const [translatedRaw, zhOriginal] = await Promise.all([
      aiService.translateContent(text),
      translateNewsOriginalToChinese((s) => aiService.translateContent(s), outerText, referencedPost),
    ])
    const translatedContent = await ensureChineseBodyShared(aiService, translatedRaw)

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

    const newsItemWithLongform = await maybeAttachAutoLongform(
      newsItem,
      {
        platform,
        text: outerText,
        sourceUrl: url,
        authorName,
        authorHandle: handle,
        urls: rawPost.urls,
        mediaUrls,
        referencedPost,
      },
      aiService,
      ctx.longformAutoBudget,
    )

    const addResult = await addPost(newsItemWithLongform, ctx.persistRawPostId ? { rawPostId: rawId } : undefined)
    if (addResult.status === 'duplicate_content') {
      await recordPassedPostSafely({
        id,
        url,
        sourcePlatform: platform,
        sourceName: authorName,
        sourceHandle: handle,
        content: outerText,
        title: newsItemWithLongform.title,
        summary: newsItemWithLongform.summary,
        category: newsItemWithLongform.category,
        passType: 'duplicate',
        passReason: '已有相似事件入库，为避免同一事件重复展示，未再次收录。',
        publishedAt,
        mediaUrls,
        socialEngagement,
        referencedPost,
      })
    }

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

    await deleteRawPostById(rawId)
    if (ctx.job) await markProcessingJobDone(ctx.job.id)
    return { outcome: 'success' }
  } catch (error) {
    console.error(`处理 ${id} 失败:`, error)
    const message = error instanceof Error ? error.message : String(error)
    await recordPassedPostSafely({
      id,
      url,
      sourcePlatform: platform,
      sourceName: authorName,
      sourceHandle: handle,
      content: outerText,
      passType: 'processing_failed',
      passReason: `处理失败：${message}`,
      publishedAt,
      mediaUrls,
      socialEngagement,
      referencedPost,
    })
    if (ctx.job) {
      await markProcessingJobFailed(ctx.job.id, message, ctx.job.attempts + 1)
    }
    return { outcome: 'error', errorMessage: message }
  }
}

export type RunRefreshProcessBody = {
  taskId?: string
  /** true：不向 taskManager 写入（供 Cron / 内部调度） */
  silent?: boolean
  /** 本批最多处理条数（job 列队 + legacy raw 各受此上限约束），默认 100，范围 1–100 */
  rawLimit?: number
  /** 当前登录用户；用于读取该用户手动恢复 PASS 的反馈样本 */
  userId?: string
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
  const userId = typeof body.userId === 'string' && body.userId.trim() ? body.userId.trim() : undefined

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
  const pipelineRt = await getEffectivePipelineRuntimeValues()
  const lowSignalThresholds: LowSignalThresholds = {
    minOuter: pipelineRt.rawMinOuterChars,
    minNestedRt: pipelineRt.rawMinNestedCharsRetweet,
  }
  const learningContextCache = new Map<string, Promise<string>>()
  const longformAutoBudget = createLongformAutoBudget()

  if (!useJobs) {
    const rawPosts = await fetchRawPostsBatch(rawLimit)

    if (rawPosts.length === 0) {
      pushProcessTelemetry(silent, taskId, {
        attempted: 0,
        success: 0,
        low: 0,
        unimportant: 0,
        errors: 0,
        samples: [],
      })
      syncTask(silent, taskId, {
        status: 'completed',
        progress: 100,
        message: '没有原始推文需要处理',
      })
      return { success: true, taskId, message: '没有推文需要处理', count: 0 }
    }

    const total = rawPosts.length
    let processed = 0
    const acc = {
      attempted: 0,
      success: 0,
      low: 0,
      unimportant: 0,
      errors: 0,
      samples: [] as string[],
    }

    for (let i = 0; i < rawPosts.length; i += BATCH_SIZE) {
      if (isUserRefreshCancelled(taskId, silent)) {
        pushProcessTelemetry(silent, taskId, acc)
        return { success: true, taskId, message: 'cancelled', count: processed }
      }
      const batch = rawPosts.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(raw =>
          processOneRawPost(raw, {
            persistRawPostId: false,
            lowSignalThresholds,
            userId,
            learningContextCache,
            longformAutoBudget,
          })
        )
      )
      for (const r of results) accumulateProcessOutcome(acc, r)
      processed += batch.length
      syncTask(silent, taskId, {
        progress: 40 + Math.round((processed / total) * 60),
        message: `已处理 ${processed}/${total} 条推文`,
      })
      pushProcessTelemetry(silent, taskId, acc)
    }

    if (isUserRefreshCancelled(taskId, silent)) {
      pushProcessTelemetry(silent, taskId, acc)
      return { success: true, taskId, message: 'cancelled', count: processed }
    }

    pushProcessTelemetry(silent, taskId, acc)
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
    pushProcessTelemetry(silent, taskId, {
      attempted: 0,
      success: 0,
      low: 0,
      unimportant: 0,
      errors: 0,
      samples: [],
    })
    syncTask(silent, taskId, {
      status: 'completed',
      progress: 100,
      message: '没有原始推文需要处理',
    })
    return { success: true, taskId, message: '没有推文需要处理', count: 0 }
  }

  let idx = 0
  const acc = {
    attempted: 0,
    success: 0,
    low: 0,
    unimportant: 0,
    errors: 0,
    samples: [] as string[],
  }
  const bumpProgress = () => {
    idx++
    syncTask(silent, taskId, {
      progress: 40 + Math.round((idx / totalWork) * 60),
      message: `已处理 ${idx}/${totalWork} 条推文`,
    })
    pushProcessTelemetry(silent, taskId, acc)
  }

  for (const job of pending) {
    if (isUserRefreshCancelled(taskId, silent)) {
      pushProcessTelemetry(silent, taskId, acc)
      return { success: true, taskId, message: 'cancelled', count: idx }
    }
    const claimed = await claimProcessingJob(job.id)
    if (!claimed) {
      bumpProgress()
      continue
    }

    if (!job.rawPostId) {
      await markProcessingJobFailed(job.id, 'missing_raw_post_id', job.attempts + 1)
      accumulateProcessOutcome(acc, { outcome: 'error', errorMessage: 'missing_raw_post_id' })
      bumpProgress()
      continue
    }

    const raw = await fetchRawPostById(job.rawPostId)
    if (!raw) {
      await markProcessingJobFailed(job.id, 'raw_missing', job.attempts + 1)
      accumulateProcessOutcome(acc, { outcome: 'error', errorMessage: 'raw_missing' })
      bumpProgress()
      continue
    }

    const one = await processOneRawPost(raw, {
      job,
      persistRawPostId,
      lowSignalThresholds,
      userId,
      learningContextCache,
      longformAutoBudget,
    })
    accumulateProcessOutcome(acc, one)
    bumpProgress()
  }

  for (let i = 0; i < legacyRaw.length; i += BATCH_SIZE) {
    if (isUserRefreshCancelled(taskId, silent)) {
      pushProcessTelemetry(silent, taskId, acc)
      return { success: true, taskId, message: 'cancelled', count: idx }
    }
    const batch = legacyRaw.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(raw =>
        processOneRawPost(raw, {
          persistRawPostId,
          lowSignalThresholds,
          userId,
          learningContextCache,
          longformAutoBudget,
        })
      )
    )
    for (const r of results) accumulateProcessOutcome(acc, r)
    for (let j = 0; j < batch.length; j++) bumpProgress()
  }

  if (isUserRefreshCancelled(taskId, silent)) {
    pushProcessTelemetry(silent, taskId, acc)
    return { success: true, taskId, message: 'cancelled', count: idx }
  }

  pushProcessTelemetry(silent, taskId, acc)
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
