import 'server-only'

import { taskManager } from '@/lib/task-manager'
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
import { getUserSubscribedHandles } from '@/lib/subscriptions'

export type RefreshFetchResult = {
  success: true
  taskId: string
  message: string
  count: number
}

/**
 * 抓取启用源 → raw_posts（与 POST /api/refresh/fetch 行为一致）
 * 传入 userId 时：只抓取该用户在订阅列表里的源（且仍在 sources 表中 enabled），与侧栏一致。
 */
export async function runRefreshFetchFromEnabledSources(body: {
  taskId?: string
  userId?: string
}): Promise<RefreshFetchResult> {
  const taskId = body.taskId || taskManager.createTask()

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

  if (body.userId) {
    const subscribedHandles = await getUserSubscribedHandles(body.userId)
    if (subscribedHandles.length === 0) {
      taskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        message: '暂无订阅的信息源，请先订阅后再抓取',
      })
      return { success: true, taskId, message: '无订阅源', count: 0 }
    }
    const subSet = new Set(subscribedHandles.map(h => String(h).toLowerCase()))
    enabledSources = enabledSources.filter(s => subSet.has(String(s.handle).toLowerCase()))
    if (enabledSources.length === 0) {
      taskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        message: '订阅的源在库中均未启用或已下线，请检查后台 sources',
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

  const [existingRawIds, existingNewsUrls] = await Promise.all([
    fetchExistingRawPostIds(),
    fetchExistingNewsSourceUrls(),
  ])
  const seenIds = new Set(existingRawIds)
  const seenUrls = new Set(existingNewsUrls)

  const newRawPosts: Record<string, unknown>[] = []
  let processed = 0
  const total = enabledSources.length

  for (const source of enabledSources) {
    if (taskManager.getTask(taskId)?.status === 'cancelled') {
      break
    }
    try {
      if (source.platform === 'X') {
        const posts = await fetchPostsFromX(source.handle)
        for (const post of posts) {
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
          if (!seenIds.has(article.id)) {
            newRawPosts.push({
              id: article.id,
              platform: source.platform,
              handle: source.handle,
              author_name: source.name,
              text: article.originalText || article.content,
              url: article.source.url,
              published_at: article.publishedAt,
              fetched_at: new Date().toISOString(),
            })
            seenIds.add(article.id)
          }
        }
      }
    } catch (error) {
      console.error(`抓取 ${source.handle} 失败:`, error)
    }

    processed++
    taskManager.updateTask(taskId, {
      progress: Math.round((processed / total) * 100),
      message: `已抓取 ${processed}/${total} 个源，${newRawPosts.length} 条新内容`,
    })
  }

  await upsertRawPosts(newRawPosts)

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

  taskManager.updateTask(taskId, {
    status: 'completed',
    progress: 100,
    message: `抓取完成：${newRawPosts.length} 条新内容`,
  })

  return {
    success: true,
    taskId,
    message: '抓取完成',
    count: newRawPosts.length,
  }
}
