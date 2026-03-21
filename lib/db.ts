import 'server-only'
import { supabase } from './supabase'
import { NewsItem } from './types'

/**
 * 从数据库读取所有新闻项
 */
export async function getAllPosts(): Promise<NewsItem[]> {
  try {
    const { data, error } = await supabase
      .from('news_items')
      .select('*')
      .order('published_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch posts:', error)
      return []
    }

    return (data || []).map(row => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      content: row.content,
      source: {
        platform: row.source_platform,
        name: row.source_name,
        handle: row.source_handle,
        url: row.source_url,
      },
      category: row.category,
      publishedAt: row.published_at,
      originalText: row.original_text,
      createdAt: row.created_at,
      importanceScore: row.importance_score,
    })) as NewsItem[]
  } catch (error) {
    console.error('Failed to fetch posts:', error)
    return []
  }
}

/**
 * 按 URL 查询新闻项
 */
export async function getPostByUrl(url: string): Promise<NewsItem | null> {
  try {
    const { data, error } = await supabase
      .from('news_items')
      .select('*')
      .eq('source_url', url)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null
      }
      console.error('Failed to fetch post by URL:', error)
      return null
    }

    if (!data) return null

    return {
      id: data.id,
      title: data.title,
      summary: data.summary,
      content: data.content,
      source: {
        platform: data.source_platform,
        name: data.source_name,
        handle: data.source_handle,
        url: data.source_url,
      },
      category: data.category,
      publishedAt: data.published_at,
      originalText: data.original_text,
      createdAt: data.created_at,
      importanceScore: data.importance_score,
    } as NewsItem
  } catch (error) {
    console.error('Failed to fetch post by URL:', error)
    return null
  }
}

/**
 * 按 ID 查询新闻项
 */
export async function getPostById(id: string): Promise<NewsItem | null> {
  try {
    const { data, error } = await supabase
      .from('news_items')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null
      }
      console.error('Failed to fetch post by ID:', error)
      return null
    }

    if (!data) return null

    return {
      id: data.id,
      title: data.title,
      summary: data.summary,
      content: data.content,
      source: {
        platform: data.source_platform,
        name: data.source_name,
        handle: data.source_handle,
        url: data.source_url,
      },
      category: data.category,
      publishedAt: data.published_at,
      originalText: data.original_text,
      createdAt: data.created_at,
      importanceScore: data.importance_score,
    } as NewsItem
  } catch (error) {
    console.error('Failed to fetch post by ID:', error)
    return null
  }
}

/**
 * 添加新闻项到数据库
 */
export async function addPost(post: NewsItem): Promise<void> {
  try {
    const { error } = await supabase.from('news_items').upsert(
      {
        id: post.id,
        title: post.title,
        summary: post.summary,
        content: post.content,
        source_platform: post.source.platform,
        source_name: post.source.name,
        source_handle: post.source.handle,
        source_url: post.source.url,
        category: post.category,
        published_at: post.publishedAt,
        original_text: post.originalText,
        created_at: post.createdAt,
        importance_score: post.importanceScore ?? null,
      },
      { onConflict: 'id' }
    )

    if (error) {
      console.error('Failed to add post:', error)
      throw error
    }
  } catch (error) {
    console.error('Failed to add post:', error)
    throw error
  }
}

/**
 * 删除指定来源的所有新闻项
 */
export async function deletePostsByHandle(handle: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('news_items')
      .delete()
      .eq('source_handle', handle)

    if (error) {
      console.error('Failed to delete posts:', error)
      throw error
    }

    return count ?? 0
  } catch (error) {
    console.error('Failed to delete posts:', error)
    throw error
  }
}
