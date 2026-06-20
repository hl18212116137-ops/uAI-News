import 'server-only'

import type { Source } from '@/lib/sources'
import { composeTextForAiProcessing, fetchPostsFromX } from '@/lib/x'
import { addPost } from '@/lib/db'
import { translateNewsOriginalToChinese } from '@/lib/news-original-chinese'
import { getDefaultAIService } from '@/lib/ai/ai-factory'
import { mergePipelineTelemetryToTask, taskManager } from '@/lib/task-manager'
import { getEffectivePipelineRuntimeValues } from '@/lib/pipeline-settings'
import { getLowSignalRawPostPassReason } from '@/lib/raw-post-quality'
import { canonicalNewsIdForPlatform } from '@/lib/news-dedupe'
import { ensureChineseBody, ensureChineseTitleSummary } from '@/lib/translation-guard'
import {
  getPersonalFilterLearningContextForUser as getFilterLearningContextForUser,
  recordPassedPostSafely,
} from '@/lib/db/pass-logs'
import type { AIProcessedContent } from '@/lib/ai/ai-service'
import { revalidateHomeFeedCaches } from '@/lib/home-cache-invalidation'

/**
 * 后台抓取并处理单源推文（与 POST /api/sources 添加源后的任务共用）
 */
export async function fetchAndProcessPostsInBackground(
  source: Source,
  taskId: string,
  userId?: string
) {
  try {
    console.log(`[后台任务] 开始抓取 @${source.handle} 的推文...`)

    taskManager.updateTask(taskId, {
      progress: 10,
      message: `正在抓取 @${source.handle} 的推文...`,
    })

    const posts = await fetchPostsFromX(source.handle)

    if (posts.length === 0) {
      taskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        message: `@${source.handle} 没有找到推文`,
      })
      return
    }

    taskManager.updateTask(taskId, {
      progress: 30,
      message: `找到 ${posts.length} 条推文，正在处理...`,
    })

    const aiService = getDefaultAIService()
    let successCount = 0
    let processedCount = 0
    let lowSignalCount = 0
    let unimportantCount = 0
    let errorCount = 0
    const pipelineRt = await getEffectivePipelineRuntimeValues()
    const lowSignalThresholds = {
      minOuter: pipelineRt.rawMinOuterChars,
      minNestedRt: pipelineRt.rawMinNestedCharsRetweet,
    }
    const filterLearningContext = await getFilterLearningContextForUser(userId, source.handle)

    const CONCURRENCY = 5

    const getAiUnimportantPassReason = (draft: AIProcessedContent): string => {
      const explicit = draft.passReason?.trim()
      if (explicit) return explicit
      const summary = draft.summary?.trim()
      if (summary) return `AI 判定信息价值不足：${summary}`
      const title = draft.title?.trim()
      return title ? `AI 判定信息价值不足：${title}` : 'AI 判定为不值得入库的低价值内容。'
    }

    for (let i = 0; i < posts.length; i += CONCURRENCY) {
      const batch = posts.slice(i, i + CONCURRENCY)

      const results = await Promise.allSettled(
        batch.map(async (post) => {
          try {
            const rawLike = {
              text: post.post_text,
              media_urls: post.media_urls,
              referenced_post: post.referencedPost,
            }
            const lowSignalReason = getLowSignalRawPostPassReason(rawLike, lowSignalThresholds)
            if (lowSignalReason) {
              await recordPassedPostSafely({
                id: canonicalNewsIdForPlatform('X', post.post_id),
                url: post.post_url,
                sourcePlatform: 'X',
                sourceName: source.name,
                sourceHandle: source.handle,
                content: post.post_text,
                passType: 'low_signal',
                passReason: lowSignalReason,
                publishedAt: post.posted_at,
                mediaUrls: post.media_urls,
                socialEngagement: post.social_engagement,
                referencedPost: post.referencedPost,
              })
              return { outcome: 'low_signal' as const, postId: post.post_id }
            }

            const textForAi = composeTextForAiProcessing(post.post_text, post.referencedPost)
            const aiDraft = await aiService.processNews(
              textForAi,
              source.name,
              source.handle,
              filterLearningContext
            )
            const aiResult = await ensureChineseTitleSummary(aiService, aiDraft)

            if (!aiResult.important) {
              await recordPassedPostSafely({
                id: canonicalNewsIdForPlatform('X', post.post_id),
                url: post.post_url,
                sourcePlatform: 'X',
                sourceName: source.name,
                sourceHandle: source.handle,
                content: post.post_text,
                title: aiResult.title,
                summary: aiResult.summary,
                category: aiResult.category,
                passType: 'ai_unimportant',
                passReason: getAiUnimportantPassReason(aiResult),
                publishedAt: post.posted_at,
                mediaUrls: post.media_urls,
                socialEngagement: post.social_engagement,
                referencedPost: post.referencedPost,
              })
              return { outcome: 'unimportant' as const, postId: post.post_id }
            }

            const [translatedRaw, zhOriginal] = await Promise.all([
              aiService.translateContent(textForAi),
              translateNewsOriginalToChinese(
                (s) => aiService.translateContent(s),
                post.post_text,
                post.referencedPost,
              ),
            ])
            const translatedContent = await ensureChineseBody(aiService, translatedRaw)
            let importanceScore = 50
            try {
              importanceScore = await aiService.scoreNewsImportance({
                title: aiResult.title,
                summary: aiResult.summary,
                content: translatedContent,
                category: aiResult.category,
                authorName: source.name,
                authorHandle: source.handle,
                publishedAt: post.posted_at,
              })
            } catch {
              // keep default
            }

            await addPost({
              id: canonicalNewsIdForPlatform('X', post.post_id),
              title: aiResult.title,
              summary: aiResult.summary,
              content: translatedContent,
              source: {
                platform: 'X',
                name: source.name,
                handle: source.handle,
                url: post.post_url,
              },
              category: aiResult.category,
              publishedAt: post.posted_at,
              originalText: zhOriginal.originalText,
              createdAt: new Date().toISOString(),
              importanceScore,
              ...(post.media_urls && post.media_urls.length > 0
                ? { mediaUrls: post.media_urls }
                : {}),
              ...(post.social_engagement && Object.keys(post.social_engagement).length > 0
                ? { socialEngagement: post.social_engagement }
                : {}),
              ...(zhOriginal.referencedPost ? { referencedPost: zhOriginal.referencedPost } : {}),
            })

            return { outcome: 'success' as const, postId: post.post_id }
          } catch (error) {
            console.error(`[后台任务] 处理推文 ${post.post_id} 失败:`, error)
            return { outcome: 'error' as const, postId: post.post_id, error }
          }
        })
      )

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          if (result.value.outcome === 'success') successCount++
          if (result.value.outcome === 'low_signal') lowSignalCount++
          if (result.value.outcome === 'unimportant') unimportantCount++
          if (result.value.outcome === 'error') errorCount++
        } else {
          errorCount++
        }
      })

      processedCount += batch.length
      const progress = 30 + Math.floor((processedCount / posts.length) * 70)
      mergePipelineTelemetryToTask(taskId, {
        rawFetchedTotal: posts.length,
        processAttempted: processedCount,
        processSuccess: successCount,
        droppedLowSignal: lowSignalCount,
        droppedUnimportant: unimportantCount,
        processErrors: errorCount,
      })
      taskManager.updateTask(taskId, {
        progress,
        message: `正在处理推文 ${processedCount}/${posts.length}...`,
      })
    }

    if (successCount > 0) {
      revalidateHomeFeedCaches()
    }

    taskManager.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      message: `成功处理 ${successCount}/${posts.length} 条推文，跳过 ${lowSignalCount + unimportantCount} 条`,
    })

    console.log(`[后台任务] 完成: @${source.handle}, 成功 ${successCount}/${posts.length} 条`)
  } catch (error) {
    console.error(`[后台任务] 抓取 @${source.handle} 失败:`, error)
    taskManager.updateTask(taskId, {
      status: 'failed',
      error: error instanceof Error ? error.message : '未知错误',
    })
  }
}
