import 'server-only'
import { supabase } from './supabase'

export type PlatformType = 'X' | 'YouTube' | 'Reddit' | 'RSS' | 'Blog'
export type FetchMethod = 'api' | 'rss' | 'scraper' | 'webhook'
export type SourceType = 'blogger' | 'media' | 'academic'

export interface Source {
  id: string
  sourceType: SourceType
  platform: PlatformType
  handle: string
  name: string
  url: string
  avatar?: string
  description?: string
  enabled: boolean
  addedAt: string
  lastFetchedAt?: string
  fetchConfig?: {
    method: FetchMethod
    interval?: number
  }
}

/** 首页全库统计卡片仅需类型与启用状态，避免 select * 拉取 fetch_config 等大字段 */
export async function getSourcesForStats(): Promise<Pick<Source, 'sourceType' | 'enabled'>[]> {
  try {
    const { data, error } = await supabase.from('sources').select('source_type, enabled')

    if (error) {
      console.error('Failed to fetch sources for stats:', error)
      return []
    }

    return (data || []).map((row) => ({
      sourceType: row.source_type as SourceType,
      enabled: row.enabled as boolean,
    }))
  } catch (error) {
    console.error('Failed to fetch sources for stats:', error)
    return []
  }
}

/**
 * 读取所有源
 */
export async function getSources(): Promise<Source[]> {
  try {
    const { data, error } = await supabase
      .from('sources')
      .select('*')
      .order('added_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch sources:', error)
      return []
    }

    return (data || []).map(row => ({
      id: row.id,
      sourceType: row.source_type,
      platform: row.platform,
      handle: row.handle,
      name: row.name,
      url: row.url,
      avatar: row.avatar,
      description: row.description,
      enabled: row.enabled,
      addedAt: row.added_at,
      lastFetchedAt: row.last_fetched_at,
      fetchConfig: row.fetch_config,
    })) as Source[]
  } catch (error) {
    console.error('Failed to fetch sources:', error)
    return []
  }
}

/**
 * 从URL提取源信息
 */
export async function extractSourceFromUrl(url: string): Promise<Partial<Source>> {
  const normalizedUrl = url.trim().toLowerCase()

  let platform: PlatformType
  let handle: string
  let profileUrl: string
  let name: string
  let avatar: string | undefined
  let description: string | undefined

  // X / Twitter
  if (normalizedUrl.includes('x.com') || normalizedUrl.includes('twitter.com')) {
    platform = 'X'

    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/').filter(p => p)

    if (pathParts.length === 0) {
      throw new Error('无法从URL中提取用户名')
    }

    handle = pathParts[0]
    profileUrl = `https://x.com/${handle}`

    try {
      const { fetchUserInfoFromX } = await import('./x')
      const userInfo = await fetchUserInfoFromX(handle)
      name = userInfo.name
      avatar = userInfo.avatar
      description = userInfo.description
    } catch (error) {
      console.error('Failed to fetch user info, using handle as name:', error)
      name = handle
    }
  } else {
    throw new Error('暂不支持该平台')
  }

  return {
    id: `${platform.toLowerCase()}-${handle}`,
    sourceType: 'blogger',
    platform,
    handle,
    name,
    avatar,
    description,
    url: profileUrl,
    enabled: true,
    addedAt: new Date().toISOString(),
    fetchConfig: {
      method: 'api',
      interval: 60,
    },
  }
}

/**
 * 添加源
 */
export async function addSource(source: Source): Promise<void> {
  try {
    const { error } = await supabase.from('sources').upsert(
      {
        id: source.id,
        source_type: source.sourceType,
        platform: source.platform,
        handle: source.handle,
        name: source.name,
        url: source.url,
        avatar: source.avatar ?? null,
        description: source.description ?? null,
        enabled: source.enabled,
        added_at: source.addedAt,
        fetch_config: source.fetchConfig ?? null,
      },
      { onConflict: 'id' }
    )

    if (error) {
      console.error('Failed to add source:', error)
      if (error.message?.includes('unique')) {
        throw new Error(`博主 @${source.handle} 已存在`)
      }
      throw error
    }
  } catch (error) {
    console.error('Failed to add source:', error)
    throw error
  }
}

/**
 * 删除源
 */
export async function deleteSource(id: string): Promise<void> {
  try {
    const { count, error } = await supabase.from('sources').delete().eq('id', id)

    if (error) {
      console.error('Failed to delete source:', error)
      throw error
    }

    if ((count ?? 0) === 0) {
      throw new Error('源不存在')
    }
  } catch (error) {
    console.error('Failed to delete source:', error)
    throw error
  }
}

/**
 * 更新源
 */
export async function updateSource(id: string, updates: Partial<Source>): Promise<void> {
  try {
    const updateData: Record<string, any> = {}

    // Convert camelCase to snake_case
    if (updates.sourceType !== undefined) updateData.source_type = updates.sourceType
    if (updates.platform !== undefined) updateData.platform = updates.platform
    if (updates.handle !== undefined) updateData.handle = updates.handle
    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.url !== undefined) updateData.url = updates.url
    if (updates.avatar !== undefined) updateData.avatar = updates.avatar
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.enabled !== undefined) updateData.enabled = updates.enabled
    if (updates.lastFetchedAt !== undefined) updateData.last_fetched_at = updates.lastFetchedAt
    if (updates.fetchConfig !== undefined) updateData.fetch_config = updates.fetchConfig

    const { error } = await supabase.from('sources').update(updateData).eq('id', id)

    if (error) {
      console.error('Failed to update source:', error)
      throw error
    }
  } catch (error) {
    console.error('Failed to update source:', error)
    throw error
  }
}

/**
 * 获取单个源
 */
export async function getSourceById(id: string): Promise<Source | null> {
  try {
    const { data, error } = await supabase.from('sources').select('*').eq('id', id).single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null
      }
      console.error('Failed to fetch source by ID:', error)
      return null
    }

    if (!data) return null

    return {
      id: data.id,
      sourceType: data.source_type,
      platform: data.platform,
      handle: data.handle,
      name: data.name,
      url: data.url,
      avatar: data.avatar,
      description: data.description,
      enabled: data.enabled,
      addedAt: data.added_at,
      lastFetchedAt: data.last_fetched_at,
      fetchConfig: data.fetch_config,
    } as Source
  } catch (error) {
    console.error('Failed to fetch source by ID:', error)
    return null
  }
}
