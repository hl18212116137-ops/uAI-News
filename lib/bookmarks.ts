import 'server-only'
import { supabase } from './supabase'
import { NewsItem } from './types'

/**
 * 获取用户收藏的新闻 ID 列表
 */
export async function getUserBookmarkIds(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('user_bookmarks')
      .select('news_item_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to get bookmark ids:', error)
      return []
    }

    return (data || []).map(row => row.news_item_id)
  } catch (error) {
    console.error('Failed to get bookmark ids:', error)
    return []
  }
}

/**
 * 添加收藏
 */
export async function addBookmark(userId: string, newsItemId: string): Promise<void> {
  const { error } = await supabase
    .from('user_bookmarks')
    .insert({ user_id: userId, news_item_id: newsItemId })

  if (error) {
    // 忽略重复收藏（唯一约束冲突）
    if (error.code !== '23505') {
      console.error('Failed to add bookmark:', error)
      throw error
    }
  }
}

/**
 * 取消收藏
 */
export async function removeBookmark(userId: string, newsItemId: string): Promise<void> {
  const { error } = await supabase
    .from('user_bookmarks')
    .delete()
    .eq('user_id', userId)
    .eq('news_item_id', newsItemId)

  if (error) {
    console.error('Failed to remove bookmark:', error)
    throw error
  }
}

/**
 * 获取用户收藏的完整新闻列表（供 /bookmarks 页面使用）
 */
export async function getBookmarkedNews(userId: string): Promise<NewsItem[]> {
  try {
    const { data, error } = await supabase
      .from('user_bookmarks')
      .select(`
        created_at,
        news_items (
          id, title, summary, content,
          source_platform, source_name, source_handle, source_url,
          category, published_at, original_text, created_at, importance_score
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to get bookmarked news:', error)
      return []
    }

    return (data || [])
      .map(row => row.news_items as any)
      .filter(Boolean)
      .map((item: any) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        content: item.content,
        source: {
          platform: item.source_platform,
          name: item.source_name,
          handle: item.source_handle,
          url: item.source_url,
        },
        category: item.category,
        publishedAt: item.published_at,
        originalText: item.original_text,
        createdAt: item.created_at,
        importanceScore: item.importance_score,
      })) as NewsItem[]
  } catch (error) {
    console.error('Failed to get bookmarked news:', error)
    return []
  }
}
