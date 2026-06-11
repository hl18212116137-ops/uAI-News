import 'server-only'
import { db } from '@/lib/db/drizzle'
import { sources } from '@/lib/db/schema'
import { eq, desc, and } from 'drizzle-orm'
import { resolveSourceProfile } from '@/lib/source-profile'

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

/** Drizzle returns Date for timestamps and null for optional fields; convert to Source interface */
function rowToSource(row: typeof sources.$inferSelect): Source {
  return {
    id: row.id,
    sourceType: row.sourceType as SourceType,
    platform: row.platform as PlatformType,
    handle: row.handle,
    name: row.name,
    url: row.url,
    avatar: row.avatar ?? undefined,
    description: row.description ?? undefined,
    enabled: row.enabled,
    addedAt: row.addedAt.toISOString(),
    lastFetchedAt: row.lastFetchedAt?.toISOString(),
    fetchConfig: row.fetchConfig as Source['fetchConfig'],
  }
}

/** 首页全库统计卡片仅需类型与启用状态，避免 select * 拉取 fetch_config 等大字段 */
export async function getSourcesForStats(): Promise<Pick<Source, 'sourceType' | 'enabled'>[]> {
  try {
    const rows = await db
      .select({ sourceType: sources.sourceType, enabled: sources.enabled })
      .from(sources)

    return rows.map((row) => ({
      sourceType: row.sourceType as SourceType,
      enabled: row.enabled,
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
    const rows = await db
      .select()
      .from(sources)
      .orderBy(desc(sources.addedAt))

    return rows.map(rowToSource)
  } catch (error) {
    console.error('Failed to fetch sources:', error)
    return []
  }
}

/** 将用户输入规范为可抓取的 X 主页 URL（支持 @handle、裸 handle、无协议链接） */
export function normalizeSourceInputUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('请输入链接地址')
  }

  if (trimmed.startsWith('@')) {
    const handle = trimmed.slice(1).split(/[/?#]/)[0]?.trim()
    if (!handle) throw new Error('无法从 @用户名 中识别 handle')
    return `https://x.com/${handle}`
  }

  if (/^[A-Za-z0-9_]{1,15}$/.test(trimmed)) {
    return `https://x.com/${trimmed}`
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`
  return withProtocol
}

/**
 * 从URL提取源信息
 */
export async function extractSourceFromUrl(url: string): Promise<Partial<Source>> {
  const profileUrl = normalizeSourceInputUrl(url)
  const normalizedUrl = profileUrl.toLowerCase()

  let platform: PlatformType
  let handle: string
  let name: string
  let avatar: string | undefined
  let description: string | undefined

  // X / Twitter
  if (normalizedUrl.includes('x.com') || normalizedUrl.includes('twitter.com')) {
    platform = 'X'

    const urlObj = new URL(profileUrl)
    const pathParts = urlObj.pathname.split('/').filter(p => p)

    if (pathParts.length === 0) {
      throw new Error('无法从URL中提取用户名')
    }

    handle = pathParts[0].replace(/^@/, '')
    if (!handle) {
      throw new Error('无法从URL中提取用户名')
    }

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

  const profile = resolveSourceProfile({ handle, platform, avatar, description })

  return {
    sourceType: 'blogger',
    platform,
    handle,
    name,
    avatar: profile.avatar,
    description: profile.description,
    url: profileUrl,
    enabled: true,
    addedAt: new Date().toISOString(),
    fetchConfig: {
      method: 'api',
      interval: 60,
    },
  }
}

export async function getSourceByHandleAndPlatform(
  handle: string,
  platform: PlatformType
): Promise<Source | null> {
  try {
    const row = await db
      .select()
      .from(sources)
      .where(and(eq(sources.handle, handle), eq(sources.platform, platform)))
      .limit(1)
      .then((r) => r[0] ?? null)

    return row ? rowToSource(row) : null
  } catch (error) {
    console.error('Failed to fetch source by handle:', error)
    return null
  }
}

/**
 * 添加源（按 handle+platform 去重；id 由数据库生成 uuid）
 */
export async function addSource(source: Source): Promise<Source> {
  try {
    const existing = await getSourceByHandleAndPlatform(source.handle, source.platform)
    const profile = resolveSourceProfile({
      handle: source.handle,
      platform: source.platform,
      avatar: source.avatar ?? existing?.avatar,
      description: source.description ?? existing?.description,
    })

    if (existing) {
      const next: Source = {
        ...existing,
        ...source,
        id: existing.id,
        avatar: profile.avatar,
        description: profile.description,
      }
      await updateSource(existing.id, next)
      return next
    }

    const [row] = await db
      .insert(sources)
      .values({
        sourceType: source.sourceType,
        platform: source.platform,
        handle: source.handle,
        name: source.name,
        url: source.url,
        avatar: profile.avatar || null,
        description: profile.description,
        enabled: source.enabled,
        addedAt: new Date(source.addedAt),
        fetchConfig: source.fetchConfig ?? null,
      })
      .returning()

    return rowToSource(row)
  } catch (error) {
    console.error('Failed to add source:', error)
    if (error instanceof Error && error.message?.includes('unique')) {
      throw new Error(`博主 @${source.handle} 已存在`)
    }
    throw error
  }
}

/**
 * 删除源
 */
export async function deleteSource(id: string): Promise<void> {
  try {
    const deleted = await db
      .delete(sources)
      .where(eq(sources.id, id))
      .returning({ id: sources.id })

    if (deleted.length === 0) {
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
    const updateData: Partial<typeof sources.$inferInsert> = {}

    if (updates.sourceType !== undefined) updateData.sourceType = updates.sourceType
    if (updates.platform !== undefined) updateData.platform = updates.platform
    if (updates.handle !== undefined) updateData.handle = updates.handle
    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.url !== undefined) updateData.url = updates.url
    if (updates.avatar !== undefined || updates.description !== undefined) {
      let handleForProfile = updates.handle
      let platformForProfile = updates.platform
      let avatarForProfile = updates.avatar
      let descriptionForProfile = updates.description
      if (!handleForProfile || !platformForProfile) {
        const current = await getSourceById(id)
        handleForProfile = handleForProfile ?? current?.handle ?? ''
        platformForProfile = platformForProfile ?? current?.platform ?? 'X'
        if (updates.avatar === undefined) avatarForProfile = current?.avatar
        if (updates.description === undefined) descriptionForProfile = current?.description
      }
      const profile = resolveSourceProfile({
        handle: handleForProfile,
        platform: platformForProfile,
        avatar: avatarForProfile,
        description: descriptionForProfile,
      })
      if (updates.avatar !== undefined) updateData.avatar = profile.avatar || null
      if (updates.description !== undefined) updateData.description = profile.description
    }
    if (updates.enabled !== undefined) updateData.enabled = updates.enabled
    if (updates.lastFetchedAt !== undefined) updateData.lastFetchedAt = new Date(updates.lastFetchedAt)
    if (updates.fetchConfig !== undefined) updateData.fetchConfig = updates.fetchConfig

    await db.update(sources).set(updateData).where(eq(sources.id, id))
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
    const row = await db
      .select()
      .from(sources)
      .where(eq(sources.id, id))
      .limit(1)
      .then(r => r[0] ?? null)

    if (!row) return null
    return rowToSource(row)
  } catch (error) {
    console.error('Failed to fetch source by ID:', error)
    return null
  }
}
