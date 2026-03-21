import { taskManager } from '@/lib/task-manager'
import { getSources } from '@/lib/sources'
import { fetchPostsFromX } from '@/lib/x'
import { fetchMediaNews } from '@/lib/media-fetcher'
import { supabase } from '@/lib/supabase'

export const maxDuration = 60

/**
 * POST /api/refresh/fetch
 * 只负责抓取推文/文章，存入 Supabase raw_posts 表
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const taskId = body.taskId || taskManager.createTask()

    taskManager.updateTask(taskId, {
      status: 'running',
      progress: 0,
      message: '正在抓取推文...',
      startTime: Date.now(),
    })

    // 检查 API key
    if (!process.env.TWITTERAPI_IO_KEY) {
      throw new Error('TWITTERAPI_IO_KEY 未配置')
    }

    // 读取所有启用的源
    const sources = await getSources()
    const enabledSources = sources.filter(s => s.enabled)

    if (enabledSources.length === 0) {
      taskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        message: '没有配置任何源',
      })
      return Response.json({ success: true, taskId, message: '没有源需要抓取', count: 0 })
    }

    // 读取已存在的 raw post IDs（用于去重）
    const { data: existingRaw } = await supabase.from('raw_posts').select('id')
    const seenIds = new Set((existingRaw || []).map((p: any) => p.id))

    const newRawPosts: any[] = []
    let processed = 0
    const total = enabledSources.length

    for (const source of enabledSources) {
      try {
        if (source.platform === 'X') {
          // 从 X/Twitter 抓取
          const posts = await fetchPostsFromX(source.handle)
          for (const post of posts) {
            if (!seenIds.has(post.post_id)) {
              newRawPosts.push({
                id: post.post_id,
                platform: 'X',
                handle: source.handle,
                author_name: source.name,
                text: post.post_text,
                url: post.post_url,
                published_at: post.posted_at,
                fetched_at: new Date().toISOString(),
              })
              seenIds.add(post.post_id)
            }
          }
        } else if (source.platform === 'RSS' || source.platform === 'Blog') {
          // 从 RSS/Blog 抓取
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

    // 批量保存到 raw_posts
    if (newRawPosts.length > 0) {
      const { error } = await supabase
        .from('raw_posts')
        .upsert(newRawPosts, { onConflict: 'id' })

      if (error) throw error
    }

    taskManager.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      message: `抓取完成：${newRawPosts.length} 条新内容`,
    })

    return Response.json({
      success: true,
      taskId,
      message: '抓取完成',
      count: newRawPosts.length,
    })
  } catch (error: any) {
    console.error('[Fetch API] Error:', error)
    return Response.json(
      { success: false, error: error.message || '抓取失败' },
      { status: 500 }
    )
  }
}
