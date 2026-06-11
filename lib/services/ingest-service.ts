import 'server-only'

import { mergePipelineTelemetryToTask, taskManager } from '@/lib/task-manager'
import { getSources } from '@/lib/sources'
import { fetchPostsFromX } from '@/lib/x'
import { fetchMediaNews } from '@/lib/media-fetcher'
import { enqueueFullPipelineJobsForRawIds } from '@/lib/db/processing-jobs'
import {
  fetchExistingNewsSourceUrls,
  fetchExistingRawPostIds,
  upsertRawPosts,
} from '@/lib/db/raw-posts'
import { isProcessingJobsPipelineEnabled } from '@/lib/processing-jobs-pipeline'
import { getEffectivePipelineRuntimeValues } from '@/lib/pipeline-settings'
import { getUserSubscribedHandles, getUserSubscribedSourceIds } from '@/lib/subscriptions'
import { normalizeSourceHandle } from '@/lib/source-avatar'

export type RefreshFetchResult = {
  success: true
  taskId: string
  message: string
  count: number
}

/**
 * 抓取启用源 → raw_posts（与 POST /api/refresh/fetch 行为一致）
 * 传入 userId 时：只抓取该用户订阅且抓取开关开启的源；匹配同时看 source_id 与规范化 handle。
 */
export async function runRefreshFetchFromEnabledSources(body: {
  taskId?: string
  userId?: string
  /**
   * false：仅抓取阶段（由 refresh-service 接着跑 process）——结束时保持 running，避免前端把任务当成已全部完成而停止轮询。
   * true（默认）：独立 POST /api/refresh/fetch 等行为，抓取结束即 completed。
   */
  completeTaskAfterFetch?: boolean
}): Promise<RefreshFetchResult> {
  const taskId = body.taskId || taskManager.createTask()
  const completeTaskAfterFetch = body.completeTaskAfterFetch !== false

  taskManager.updateTask(taskId, {
    status: 'running',
    progress: 0,
    message: '正在抓取推文...',
    startTime: Date.now(),
  })

  if (!process.env.TWITTERAPI_IO_KEY) {
    throw new Error('TWITTERAPI_IO_KEY 未配置')
  }

  const sources = await getSources()
  let enabledSources = sources.filter(s => s.enabled)
  let sourcesSkippedDisabled = 0

  if (body.userId) {
    const [subscribedHandles, subscribedSourceIds] = await Promise.all([
      getUserSubscribedHandles(body.userId),
      getUserSubscribedSourceIds(body.userId),
    ])
    if (subscribedHandles.length === 0 && subscribedSourceIds.length === 0) {
      taskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        message: '暂无订阅的信息源，请先订阅后再抓取',
      })
      return { success: true, taskId, message: '无订阅源', count: 0 }
    }
    const subHandleSet = new Set(subscribedHandles.map(normalizeSourceHandle).filter(Boolean))
    const subIdSet = new Set(subscribedSourceIds.map(String))
    const subscribedSources = sources.filter(
      s => subIdSet.has(String(s.id)) || subHandleSet.has(normalizeSourceHandle(s.handle))
    )
    sourcesSkippedDisabled = subscribedSources.filter(s => !s.enabled).length
    enabledSources = subscribedSources.filter(s => s.enabled)
    if (enabledSources.length === 0) {
      taskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        message: '订阅的信息源目前都暂停抓取，请在规则面板中启用抓取开关',
      })
      mergePipelineTelemetryToTask(taskId, {
        sourcesProcessed: 0,
        sourcesTotal: subscribedSources.length,
        sourcesSkippedDisabled,
      })
      return { success: true, taskId, message: '无可用订阅源', count: 0 }
    }
  }

  if (enabledSources.length === 0) {
    taskManager.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      message: '没有配置任何源',
    })
    return { success: true, taskId, message: '没有源需要抓取', count: 0 }
  }

  const [existingRawIds, existingNewsUrls, pipelineRt] = await Promise.all([
    fetchExistingRawPostIds(),
    fetchExistingNewsSourceUrls(),
    getEffectivePipelineRuntimeValues(),
  ])
  const seenIds = new Set(existingRawIds)
  const seenUrls = new Set(existingNewsUrls)
  const ingestDedupeRssBlogMatchNewsUrl = pipelineRt.ingestDedupeRssBlogMatchNewsUrl

  const newRawPosts: Record<string, unknown>[] = []
  let processed = 0
  const total = enabledSources.length
  let rawFetchedTotal = 0
  let rawSkippedDuplicate = 0

  const pushTelemetry = () => {
    mergePipelineTelemetryToTask(taskId, {
      rawFetchedTotal,
      rawSkippedDuplicate,
      rawInserted: newRawPosts.length,
      sourcesProcessed: processed,
      sourcesTotal: total,
      sourcesSkippedDisabled,
    })
  }

  for (const source of enabledSources) {
    if (taskManager.getTask(taskId)?.status === 'cancelled') {
      break
    }
    try {
      if (source.platform === 'X') {
        const posts = await fetchPostsFromX(source.handle)
        for (const post of posts) {
          rawFetchedTotal++
          const normalizedId = post.post_id.replace(/^x_/, 'x-')
          if (!seenIds.has(normalizedId) && !seenUrls.has(post.post_url)) {
            newRawPosts.push({
              id: normalizedId,
              platform: 'X',
              handle: source.handle,
              author_name: source.name,
              text: post.post_text,
              url: post.post_url,
              published_at: post.posted_at,
              fetched_at: new Date().toISOString(),
              ...(post.media_urls && post.media_urls.length > 0
                ? { media_urls: post.media_urls }
                : {}),
              ...(post.social_engagement && Object.keys(post.social_engagement).length > 0
                ? { social_engagement: post.social_engagement }
                : {}),
              ...(post.referencedPost ? { referenced_post: post.referencedPost } : {}),
            })
            seenIds.add(normalizedId)
            seenUrls.add(post.post_url)
          } else {
            rawSkippedDuplicate++
          }
        }
      } else if (source.platform === 'RSS' || source.platform === 'Blog') {
        const articles = await fetchMediaNews({
          name: source.name,
          handle: source.handle,
          url: source.url,
          fetchConfig: source.fetchConfig as any,
        })
        for (const article of articles) {
          rawFetchedTotal++
          const articleUrl = article.source.url
          const dupById = seenIds.has(article.id)
          const dupByUrl =
            ingestDedupeRssBlogMatchNewsUrl && seenUrls.has(articleUrl)
          if (dupById || dupByUrl) {
            rawSkippedDuplicate++
            continue
          }
          const rssText = article.originalText || article.content || ''
          newRawPosts.push({
            id: article.id,
            platform: source.platform,
            handle: source.handle,
            author_name: source.name,
            text: rssText,
            url: articleUrl,
            published_at: article.publishedAt,
            fetched_at: new Date().toISOString(),
          })
          seenIds.add(article.id)
          seenUrls.add(articleUrl)
        }
      }
    } catch (error) {
      console.error(`抓取 ${source.handle} 失败:`, error)
    }

    processed++
    pushTelemetry()
    taskManager.updateTask(taskId, {
      progress: Math.round((processed / total) * 100),
      message: `已抓取 ${processed}/${total} 个源，${newRawPosts.length} 条新内容`,
    })
  }

  await upsertRawPosts(newRawPosts)
  pushTelemetry()

  if (taskManager.getTask(taskId)?.status === 'cancelled') {
    return {
      success: true,
      taskId,
      message: 'cancelled',
      count: newRawPosts.length,
    }
  }

  if (isProcessingJobsPipelineEnabled() && newRawPosts.length > 0) {
    const ids = newRawPosts.map(r => r.id as string).filter(Boolean)
    await enqueueFullPipelineJobsForRawIds(ids)
  }

  if (completeTaskAfterFetch) {
    taskManager.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      message: `抓取完成：${newRawPosts.length} 条新内容`,
    })
  } else {
    taskManager.updateTask(taskId, {
      status: 'running',
      progress: 38,
      message: `抓取完成：${newRawPosts.length} 条新内容，正在 AI 处理…`,
    })
  }

  return {
    success: true,
    taskId,
    message: '抓取完成',
    count: newRawPosts.length,
  }
}
