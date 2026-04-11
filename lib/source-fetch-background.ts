import 'server-only'

import type { Source } from '@/lib/sources'
import { composeTextForAiProcessing, fetchPostsFromX } from '@/lib/x'
import { addPost } from '@/lib/db'
import { translateNewsOriginalToChinese } from '@/lib/news-original-chinese'
import { getDefaultAIService } from '@/lib/ai/ai-factory'
import { taskManager } from '@/lib/task-manager'

/**
 * 后台抓取并处理单源推文（与 POST /api/sources 添加源后的任务共用）
 */
export async function fetchAndProcessPostsInBackground(source: Source, taskId: string) {
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

    const CONCURRENCY = 5

    for (let i = 0; i < posts.length; i += CONCURRENCY) {
      const batch = posts.slice(i, i + CONCURRENCY)

      const results = await Promise.allSettled(
        batch.map(async (post) => {
          try {
            const textForAi = composeTextForAiProcessing(post.post_text, post.referencedPost)
            const aiResult = await aiService.processNews(textForAi, source.name, source.handle)

            const [translatedContent, zhOriginal] = await Promise.all([
              aiService.translateContent(textForAi),
              translateNewsOriginalToChinese(
                (s) => aiService.translateContent(s),
                post.post_text,
                post.referencedPost,
              ),
            ])

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
              id: `x-${post.post_id}`,
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

            return { success: true, postId: post.post_id }
          } catch (error) {
            console.error(`[后台任务] 处理推文 ${post.post_id} 失败:`, error)
            return { success: false, postId: post.post_id, error }
          }
        })
      )

      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++
        }
      })

      processedCount += batch.length
      const progress = 30 + Math.floor((processedCount / posts.length) * 70)
      taskManager.updateTask(taskId, {
        progress,
        message: `正在处理推文 ${processedCount}/${posts.length}...`,
      })
    }

    taskManager.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      message: `成功处理 ${successCount}/${posts.length} 条推文`,
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
