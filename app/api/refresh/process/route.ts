import { taskManager } from '@/lib/task-manager'
import { getDefaultAIService } from '@/lib/ai/ai-factory'
import { supabase } from '@/lib/supabase'
import { addPost } from '@/lib/db'
import { NewsItem, NewsCategory } from '@/lib/types'

export const maxDuration = 60

/**
 * POST /api/refresh/process
 * 只负责 AI 处理，从 Supabase raw_posts 读取，写入 news_items
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const taskId = body.taskId || taskManager.createTask()

    taskManager.updateTask(taskId, {
      status: 'running',
      progress: 40,
      message: '正在 AI 处理推文...',
      startTime: Date.now(),
    })

    // 从 Supabase 读取 raw_posts（每次最多处理100条）
    const { data: rawPosts, error: fetchError } = await supabase
      .from('raw_posts')
      .select('*')
      .limit(100)

    if (fetchError) throw fetchError

    if (!rawPosts || rawPosts.length === 0) {
      taskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        message: '没有原始推文需要处理',
      })
      return Response.json({ success: true, taskId, message: '没有推文需要处理', count: 0 })
    }

    const aiService = getDefaultAIService()
    let processed = 0
    const total = rawPosts.length
    const BATCH_SIZE = 5

    // 处理单条 raw_post 的函数
    async function processOne(rawPost: any): Promise<void> {
      try {
        const aiResult = await aiService.processNews(
          rawPost.text,
          rawPost.author_name,
          rawPost.handle
        )

        if (!aiResult.important) {
          await supabase.from('raw_posts').delete().eq('id', rawPost.id)
          return
        }

        const translatedContent = await aiService.translateContent(rawPost.text)

        const newsItem: NewsItem = {
          id: rawPost.id,
          title: aiResult.title,
          summary: aiResult.summary,
          content: translatedContent,
          source: {
            platform: rawPost.platform as any,
            name: rawPost.author_name,
            handle: rawPost.handle,
            url: rawPost.url,
          },
          category: aiResult.category as NewsCategory,
          publishedAt: rawPost.published_at,
          originalText: rawPost.text,
          createdAt: new Date().toISOString(),
        }

        try {
          const score = await aiService.scoreNewsImportance({
            title: newsItem.title,
            summary: newsItem.summary,
            content: newsItem.content,
            category: newsItem.category,
            authorName: rawPost.author_name,
            authorHandle: rawPost.handle,
            publishedAt: rawPost.published_at,
          })
          newsItem.importanceScore = score
        } catch {
          // 评分失败不影响保存
        }

        await addPost(newsItem)
        await supabase.from('raw_posts').delete().eq('id', rawPost.id)
      } catch (error) {
        console.error(`处理 ${rawPost.id} 失败:`, error)
      }
    }

    // 分批并发处理（每批 5 条）
    for (let i = 0; i < rawPosts.length; i += BATCH_SIZE) {
      const batch = rawPosts.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(batch.map(processOne))
      processed += batch.length
      const progress = 40 + Math.round((processed / total) * 60)
      taskManager.updateTask(taskId, {
        progress,
        message: `已处理 ${processed}/${total} 条推文`,
      })
    }

    taskManager.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      message: `处理完成：${processed} 条推文`,
    })

    return Response.json({
      success: true,
      taskId,
      message: '处理完成',
      count: processed,
    })
  } catch (error: any) {
    console.error('[Process API] Error:', error)
    return Response.json(
      { success: false, error: error.message || '处理失败' },
      { status: 500 }
    )
  }
}
