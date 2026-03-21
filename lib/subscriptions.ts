import 'server-only'
import { supabase } from './supabase'
import { NewsItem } from './types'

type SourceMeta = {
  id: string
  handle: string
  name: string
  avatar?: string
  description?: string
  postCount: number
  latestPostTime?: string
  sourceType?: 'blogger' | 'media' | 'academic'
}

/**
 * 获取用户订阅的信息源 handle 列表（用于 feed 查询）
 */
export async function getUserSubscribedHandles(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('user_source_subscriptions')
      .select('source_handle')
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to get subscribed handles:', error)
      return []
    }

    return (data || []).map((row: any) => row.source_handle)
  } catch (error) {
    console.error('Failed to get subscribed handles:', error)
    return []
  }
}

/**
 * 获取用户订阅的信息源 source_id 列表（用于前端按钮状态初始化）
 */
export async function getUserSubscribedSourceIds(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('user_source_subscriptions')
      .select('source_id')
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to get subscribed source ids:', error)
      return []
    }

    return (data || []).map((row: any) => row.source_id)
  } catch (error) {
    console.error('Failed to get subscribed source ids:', error)
    return []
  }
}

/**
 * 订阅信息源
 * 使用 source_handle 唯一约束去重，重复订阅静默忽略
 */
export async function subscribeSource(
  userId: string,
  sourceId: string,
  sourceHandle: string
): Promise<void> {
  const { error } = await supabase
    .from('user_source_subscriptions')
    .insert({ user_id: userId, source_id: sourceId, source_handle: sourceHandle })

  if (error) {
    // 唯一约束冲突（重复订阅）→ 静默忽略
    if (error.code !== '23505') {
      console.error('Failed to subscribe source:', error)
      throw error
    }
  }
}

/**
 * 取消订阅
 */
export async function unsubscribeSource(userId: string, sourceId: string): Promise<void> {
  const { error } = await supabase
    .from('user_source_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('source_id', sourceId)

  if (error) {
    console.error('Failed to unsubscribe source:', error)
    throw error
  }
}

/**
 * 获取用户的个性化 feed
 * 两步查询：先取订阅 handles → 再查 news_items WHERE source_handle IN (handles)
 */
export async function getSubscribedFeed(userId: string): Promise<NewsItem[]> {
  try {
    const handles = await getUserSubscribedHandles(userId)

    if (handles.length === 0) return []

    const { data, error } = await supabase
      .from('news_items')
      .select('*')
      .in('source_handle', handles)
      .order('published_at', { ascending: false })

    if (error) {
      console.error('Failed to get subscribed feed:', error)
      return []
    }

    return (data || []).map((row: any) => ({
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
    console.error('Failed to get subscribed feed:', error)
    return []
  }
}

/**
 * 获取用户已订阅信息源的元数据（供 SourcesList 展示）
 * 两步查询：先取订阅记录 → 再批量查 sources 表 → 聚合 postCount
 */
export async function getSubscribedSourcesMeta(userId: string): Promise<SourceMeta[]> {
  try {
    // 第一步：取订阅的 source_id 列表
    const { data: subscriptions, error: subError } = await supabase
      .from('user_source_subscriptions')
      .select('source_id, source_handle')
      .eq('user_id', userId)

    if (subError || !subscriptions || subscriptions.length === 0) return []

    const sourceIds = subscriptions.map((s: any) => s.source_id)
    const handles = subscriptions.map((s: any) => s.source_handle)

    // 第二步：批量查 sources 表
    const [{ data: sourcesData }, { data: postCounts }] = await Promise.all([
      supabase
        .from('sources')
        .select('*')
        .in('id', sourceIds),
      // 聚合每个 handle 的文章数和最新发布时间
      supabase
        .from('news_items')
        .select('source_handle, published_at')
        .in('source_handle', handles),
    ])

    // 计算 postCount 和 latestPostTime
    const countMap = new Map<string, { count: number; latest?: string }>()
    for (const item of postCounts || []) {
      const key = (item.source_handle as string).toLowerCase()
      const existing = countMap.get(key) || { count: 0 }
      existing.count += 1
      if (!existing.latest || item.published_at > existing.latest) {
        existing.latest = item.published_at
      }
      countMap.set(key, existing)
    }

    return (sourcesData || []).map((s: any) => {
      const stats = countMap.get(s.handle?.toLowerCase()) || { count: 0 }
      return {
        id: s.id,
        handle: s.handle,
        name: s.name,
        avatar: s.avatar,
        description: s.description,
        postCount: stats.count,
        latestPostTime: stats.latest,
        sourceType: s.source_type,
      }
    }) as SourceMeta[]
  } catch (error) {
    console.error('Failed to get subscribed sources meta:', error)
    return []
  }
}

/**
 * 获取全局热门推荐信息源（排除已订阅的）
 * 供 SourcesList 的"推荐关注"区块使用，以及未登录/无订阅时的引导
 */
export async function getRecommendedSources(
  userId: string | null,
  limit = 8
): Promise<SourceMeta[]> {
  try {
    // 取所有 sources
    const { data: allSources, error } = await supabase
      .from('sources')
      .select('*')
      .eq('enabled', true)

    if (error || !allSources) return []

    // 排除已订阅的
    let excludeHandles: string[] = []
    if (userId) {
      excludeHandles = await getUserSubscribedHandles(userId)
    }

    const unsubscribed = allSources.filter(
      (s: any) => !excludeHandles.map(h => h.toLowerCase()).includes(s.handle?.toLowerCase())
    )

    // 获取文章数，用于排序
    const handles = unsubscribed.map((s: any) => s.handle)
    if (handles.length === 0) return []

    const { data: postCounts } = await supabase
      .from('news_items')
      .select('source_handle')
      .in('source_handle', handles)

    const countMap = new Map<string, number>()
    for (const item of postCounts || []) {
      const key = (item.source_handle as string).toLowerCase()
      countMap.set(key, (countMap.get(key) || 0) + 1)
    }

    return unsubscribed
      .map((s: any) => ({
        id: s.id,
        handle: s.handle,
        name: s.name,
        avatar: s.avatar,
        description: s.description,
        postCount: countMap.get(s.handle?.toLowerCase()) || 0,
        sourceType: s.source_type,
      }))
      .sort((a, b) => b.postCount - a.postCount)
      .slice(0, limit) as SourceMeta[]
  } catch (error) {
    console.error('Failed to get recommended sources:', error)
    return []
  }
}

/**
 * 获取精选推荐文章（用于未登录或无订阅用户的首页 feed）
 * 按 importance_score 降序取最重要的文章
 */
export async function getTopRecommendedPosts(limit = 30): Promise<NewsItem[]> {
  try {
    const { data, error } = await supabase
      .from('news_items')
      .select('*')
      .not('importance_score', 'is', null)
      .order('importance_score', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Failed to get top recommended posts:', error)
      return []
    }

    return (data || []).map((row: any) => ({
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
    console.error('Failed to get top recommended posts:', error)
    return []
  }
}
