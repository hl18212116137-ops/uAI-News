import 'server-only'
import { db } from '@/lib/db/drizzle'
import { userSourceSubscriptions, newsItems, sources } from '@/lib/db/schema'
import { eq, and, desc, gte, inArray, isNotNull, notLike, sql } from 'drizzle-orm'
import {
  mediaUrlsFromDbJson,
  longformArticleFromDbJson,
  referencedPostFromDbJson,
  socialEngagementFromDbJson,
  withCanonicalPostSourceUrl,
} from '@/lib/db/news'
import { NewsItem } from './types'
import { mergeDemoPostsIfFeedEmpty } from './demo-feed-posts'
import { scheduleStaleSourceFetches } from './feed-stale-fetch'
import { fetchSourceProfilesByHandles, mergeSourceProfilesIntoPosts } from './news-source-enrichment'
import { expandHandleQueryVariants, normalizeSourceHandle } from './source-avatar'
import { resolveSourceHomeUrl } from './source-home-url'
import { resolveSourceProfile } from './source-profile'
import { getFeedPublishedAtGte, getRecommendationFeedPublishedAtGte } from './feed-window'
import { applyRecommendationToPosts, getUserRecommendationVisibleDays } from '@/lib/user-pipeline-rules'
import {
  filterPostsForPublicFeed,
  getFeedMinImportanceScore,
  RECOMMENDED_SIDEBAR_LIMIT,
} from '@/lib/feed-quality'
import type { SourceType } from '@/lib/sources'

/** 排除本地种子帖（source_url 为假 status，外链会 404） */
const EXCLUDE_PLACEHOLDER_NEWS = notLike(newsItems.id, 'seed-%')

/** news_items 列：与列表 + INSIGHT 首包映射一致；避免 select('*') 随表膨胀 */
const NEWS_ITEMS_FEED_COLUMNS = {
  id: newsItems.id,
  title: newsItems.title,
  summary: newsItems.summary,
  content: newsItems.content,
  sourcePlatform: newsItems.sourcePlatform,
  sourceName: newsItems.sourceName,
  sourceHandle: newsItems.sourceHandle,
  sourceUrl: newsItems.sourceUrl,
  category: newsItems.category,
  publishedAt: newsItems.publishedAt,
  originalText: newsItems.originalText,
  createdAt: newsItems.createdAt,
  importanceScore: newsItems.importanceScore,
  mediaUrls: newsItems.mediaUrls,
  socialEngagement: newsItems.socialEngagement,
  referencedPost: newsItems.referencedPost,
  longformJson: newsItems.longformJson,
}

type NewsFeedRow = {
  id: string
  title: string
  summary: string
  content: string
  sourcePlatform: string | null
  sourceName: string | null
  sourceHandle: string | null
  sourceUrl: string | null
  category: string | null
  publishedAt: Date | string
  originalText: string | null
  createdAt: Date | string
  importanceScore: number | null
  mediaUrls: unknown
  socialEngagement: unknown
  referencedPost: unknown
  longformJson: unknown
}

function mapRowToNewsItem(row: NewsFeedRow): NewsItem {
  return withCanonicalPostSourceUrl({
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    source: {
      platform: row.sourcePlatform as NewsItem['source']['platform'],
      name: row.sourceName ?? '',
      handle: row.sourceHandle ?? '',
      url: row.sourceUrl ?? '',
    },
    category: row.category as NewsItem['category'],
    publishedAt: row.publishedAt instanceof Date ? row.publishedAt.toISOString() : row.publishedAt,
    originalText: row.originalText ?? '',
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    importanceScore: row.importanceScore ?? undefined,
    mediaUrls: mediaUrlsFromDbJson(row.mediaUrls),
    socialEngagement: socialEngagementFromDbJson(row.socialEngagement),
    referencedPost: referencedPostFromDbJson(row.referencedPost),
    longform: longformArticleFromDbJson(row.longformJson),
  })
}

export type SourceMeta = {
  id: string
  handle: string
  name: string
  url?: string
  avatar: string
  description: string
  enabled?: boolean
  postCount: number
  latestPostTime?: string
  sourceType?: SourceType
}

type SourcePostStats = {
  count: number
  latest?: string
}

function normalizeSourceType(value: string | null | undefined): SourceType {
  return value === 'media' || value === 'academic' ? value : 'blogger'
}

function dateToIso(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim()) return value
  return undefined
}

function mergeSourcePostStats(
  map: Map<string, SourcePostStats>,
  handle: string | null | undefined,
  count: unknown,
  latest: unknown
) {
  const key = normalizeSourceHandle(handle)
  if (!key) return

  const latestIso = dateToIso(latest)
  const prev = map.get(key) ?? { count: 0, latest: undefined }
  const nextLatest =
    latestIso && (!prev.latest || latestIso > prev.latest) ? latestIso : prev.latest

  map.set(key, {
    count: prev.count + Number(count ?? 0),
    latest: nextLatest,
  })
}

async function getSourcePostStatsByHandle(
  handles: string[],
  since: Date
): Promise<Map<string, SourcePostStats>> {
  const variants = expandHandleQueryVariants(handles)
  if (variants.length === 0) return new Map()

  const rows = await db
    .select({
      sourceHandle: newsItems.sourceHandle,
      postCount: sql<number>`count(*)::int`,
      latestPostTime: sql<Date | string | null>`max(${newsItems.publishedAt})`,
    })
    .from(newsItems)
    .where(
      and(
        EXCLUDE_PLACEHOLDER_NEWS,
        inArray(newsItems.sourceHandle, variants),
        gte(newsItems.publishedAt, since)
      )
    )
    .groupBy(newsItems.sourceHandle)

  const out = new Map<string, SourcePostStats>()
  for (const row of rows) {
    mergeSourcePostStats(out, row.sourceHandle, row.postCount, row.latestPostTime)
  }
  return out
}

/** 保证侧栏/API 返回的 SourceMeta 始终带头像 URL 与非空简介 */
function withResolvedSourceProfile(row: {
  id: string
  handle: string
  name: string
  url?: string | null
  avatar?: string | null
  description?: string | null
  platform?: string | null
  enabled?: boolean
  postCount: number
  latestPostTime?: string
  sourceType?: string
}): SourceMeta {
  const profile = resolveSourceProfile({
    handle: row.handle,
    platform: row.platform ?? 'X',
    avatar: row.avatar,
    description: row.description,
  })
  return {
    ...row,
    url: resolveSourceHomeUrl(row),
    avatar: profile.avatar,
    description: profile.description,
    sourceType: normalizeSourceType(row.sourceType),
  }
}

export type GetRecommendedSourcesOptions = {
  /** 为 true 时在候选池中洗牌后取 limit 条（刷新推荐用） */
  pickRandom?: boolean
  /** 刷新「换一批」时排除当前已展示的推荐 id */
  excludeSourceIds?: string[]
  /** 刷新时排除当前已展示的 handle（比 id 更可靠，兼容 demo id） */
  excludeHandles?: string[]
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

/**
 * 获取用户订阅的信息源 handle 列表（用于 feed 查询）
 */
export async function getUserSubscribedHandles(userId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ sourceHandle: userSourceSubscriptions.sourceHandle })
      .from(userSourceSubscriptions)
      .where(eq(userSourceSubscriptions.userId, userId))

    return rows
      .map(row => row.sourceHandle)
      .filter((h): h is string => h != null)
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
    const rows = await db
      .select({ sourceId: userSourceSubscriptions.sourceId })
      .from(userSourceSubscriptions)
      .where(eq(userSourceSubscriptions.userId, userId))

    return rows.map(row => row.sourceId)
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
  const { resolveSubscriptionSourceId } = await import('@/lib/resolve-subscription-source-id')
  const resolvedId = await resolveSubscriptionSourceId(sourceId, sourceHandle)
  await db
    .insert(userSourceSubscriptions)
    .values({ userId, sourceId: resolvedId, sourceHandle })
    .onConflictDoNothing()
}

const DEFAULT_GUEST_HANDLES = ["karpathy", "sama", "ylecun"]

async function getDefaultSubscriptionCandidates(
  defaultCount: number
): Promise<Array<{ id: string; handle: string }>> {
  const recentPostRows = await db
    .select({ handle: newsItems.sourceHandle })
    .from(newsItems)
    .where(and(EXCLUDE_PLACEHOLDER_NEWS, isNotNull(newsItems.sourceHandle)))
    .orderBy(desc(newsItems.publishedAt))
    .limit(Math.max(30, defaultCount * 20))

  const recentHandles = Array.from(
    new Set(
      recentPostRows
        .map((row) => String(row.handle ?? "").trim())
        .filter(Boolean)
    )
  )
  const preferredHandles = [...recentHandles, ...DEFAULT_GUEST_HANDLES]
  const preferredRows = await db
    .select({ id: sources.id, handle: sources.handle })
    .from(sources)
    .where(
      and(
        eq(sources.enabled, true),
        inArray(sources.handle, expandHandleQueryVariants(preferredHandles))
      )
    )

  const preferredByHandle = new Map(
    preferredRows.map((row) => [String(row.handle).toLowerCase(), row])
  )
  const picked: Array<{ id: string; handle: string }> = []
  const pickedHandles = new Set<string>()

  for (const handle of preferredHandles) {
    const normalized = handle.toLowerCase()
    const row = preferredByHandle.get(normalized)
    if (!row || pickedHandles.has(normalized)) continue
    picked.push(row)
    pickedHandles.add(normalized)
    if (picked.length >= defaultCount) return picked
  }

  const fallbackRows = await db
    .select({ id: sources.id, handle: sources.handle })
    .from(sources)
    .where(eq(sources.enabled, true))
    .orderBy(desc(sources.addedAt))
    .limit(defaultCount * 3)

  for (const row of fallbackRows) {
    const normalized = String(row.handle).toLowerCase()
    if (pickedHandles.has(normalized)) continue
    picked.push(row)
    pickedHandles.add(normalized)
    if (picked.length >= defaultCount) break
  }

  return picked
}

/**
 * 为"新用户/首次进入"自动补齐默认订阅（3条）
 *
 * 长远考虑：
 * - 不强依赖固定 handles（因为不同环境 sources 表可能不同）
 * - 从 enabled=true 的 sources 里取最近 added_at 的 3 条，尽量保证能有内容展示
 */
export async function ensureDefaultSubscriptions(userId: string, defaultCount = 3): Promise<void> {
  try {
    const existing = await db
      .select({ sourceId: userSourceSubscriptions.sourceId })
      .from(userSourceSubscriptions)
      .where(eq(userSourceSubscriptions.userId, userId))
      .limit(1)

    if (existing.length > 0) return

    const enabledSources = await getDefaultSubscriptionCandidates(defaultCount)

    if (enabledSources.length === 0) return

    const inserts = enabledSources.slice(0, defaultCount).map(s => ({
      userId,
      sourceId: s.id,
      sourceHandle: s.handle,
    }))

    await db.insert(userSourceSubscriptions).values(inserts).onConflictDoNothing()

    const handles = enabledSources.slice(0, defaultCount).map((s) => String(s.handle))
    scheduleStaleSourceFetches(handles)
  } catch (error) {
    console.error('ensureDefaultSubscriptions error:', error)
  }
}

/**
 * 为"未登录用户/访客"选择默认订阅 source handles（不写入 DB，只做读取）
 * - 优先从 placeholders 找 enabled=true 的源
 * - 不足时用 enabled=true 最新 added_at 的源补齐
 */
export async function getDefaultSubscribedHandles(defaultCount = 3): Promise<string[]> {
  try {
    const candidates = await getDefaultSubscriptionCandidates(defaultCount)
    return candidates.map((source) => String(source.handle))
  } catch (err) {
    console.error("getDefaultSubscribedHandles error:", err)
    return DEFAULT_GUEST_HANDLES.slice(0, defaultCount)
  }
}

/**
 * 基于 source handles 直接获取 feed（用于未登录访客）
 */
export async function getFeedByHandles(handles: string[]): Promise<NewsItem[]> {
  try {
    const normalized = handles.map(h => h.trim()).filter(Boolean)
    if (normalized.length === 0) return []

    const feedSince = getFeedPublishedAtGte()
    const handleVariants = expandHandleQueryVariants(normalized)
    const data = await db
      .select(NEWS_ITEMS_FEED_COLUMNS)
      .from(newsItems)
      .where(and(
        EXCLUDE_PLACEHOLDER_NEWS,
        inArray(newsItems.sourceHandle, handleVariants),
        gte(newsItems.publishedAt, feedSince),
      ))
      .orderBy(desc(newsItems.publishedAt))

    const mapped = data.map(mapRowToNewsItem)

    const profiles = await fetchSourceProfilesByHandles(normalized)
    const enriched = mergeSourceProfilesIntoPosts(mapped, profiles)
    const curated = filterPostsForPublicFeed(enriched)
    if (curated.length === 0) {
      scheduleStaleSourceFetches(normalized)
    }
    return mergeDemoPostsIfFeedEmpty(curated, normalized)
  } catch (error) {
    console.error("Failed to get feed by handles:", error)
    const normalized = handles.map(h => h.trim()).filter(Boolean)
    const demo = mergeDemoPostsIfFeedEmpty([], normalized)
    const profiles = await fetchSourceProfilesByHandles(normalized)
    return mergeSourceProfilesIntoPosts(demo, profiles)
  }
}

/**
 * 基于 source handles 直接获取 SOURCES 面板所需元数据（用于未登录访客）
 */
export async function getSubscribedSourcesMetaByHandles(handles: string[]): Promise<SourceMeta[]> {
  try {
    const normalized = handles.map(h => h.trim()).filter(Boolean)
    if (normalized.length === 0) return []

    const nameMap: Record<string, string> = {
      karpathy: "Andrej Karpathy",
      sama: "Sam Altman",
      ylecun: "Yann LeCun",
    }

    const sourcesData = await db
      .select({
        id: sources.id,
        handle: sources.handle,
        name: sources.name,
        url: sources.url,
        avatar: sources.avatar,
        description: sources.description,
        enabled: sources.enabled,
        sourceType: sources.sourceType,
        platform: sources.platform,
      })
      .from(sources)
      .where(and(
        inArray(sources.handle, expandHandleQueryVariants(normalized)),
        eq(sources.enabled, true),
      ))

    const srcs = sourcesData.map(row => ({
      id: row.id,
      handle: row.handle,
      name: row.name,
      url: row.url,
      avatar: row.avatar,
      description: row.description,
      enabled: row.enabled,
      sourceType: row.sourceType,
      platform: row.platform,
    }))

    const handleToSource = new Map<string, typeof srcs[number]>()
    for (const s of srcs) handleToSource.set(normalizeSourceHandle(s.handle), s)

    const feedSinceMeta = getFeedPublishedAtGte()
    let countMap = new Map<string, SourcePostStats>()
    try {
      countMap = await getSourcePostStatsByHandle(normalized, feedSinceMeta)
    } catch (err) {
      console.error("Failed to aggregate post counts by handles:", err)
    }

    const guestRow = (h: string): SourceMeta =>
      withResolvedSourceProfile({
        id: `guest-${h.toLowerCase()}`,
        handle: h,
        name: nameMap[h.toLowerCase()] || h,
        postCount: 0,
        latestPostTime: undefined,
        sourceType: "blogger",
        platform: 'X',
      })

    const out: SourceMeta[] = []
    for (const h of normalized) {
      const key = normalizeSourceHandle(h)
      const src = handleToSource.get(key)
      const meta = countMap.get(key) || { count: 0, latest: undefined }
      if (src) {
        out.push(
          withResolvedSourceProfile({
            id: src.id,
            handle: src.handle,
            name: src.name,
            url: src.url,
            avatar: src.avatar,
            description: src.description,
            platform: src.platform,
            enabled: src.enabled,
            postCount: meta.count,
            latestPostTime: meta.latest,
            sourceType: normalizeSourceType(src.sourceType),
          })
        )
      } else {
        out.push(guestRow(h))
      }
    }

    return out
  } catch (error) {
    console.error("getSubscribedSourcesMetaByHandles error:", error)
    const normalized = handles.map(h => h.trim()).filter(Boolean)
    const nameMap: Record<string, string> = {
      karpathy: "Andrej Karpathy",
      sama: "Sam Altman",
      ylecun: "Yann LeCun",
    }
    return normalized.slice(0, 3).map((h) =>
      withResolvedSourceProfile({
        id: `guest-${h.toLowerCase()}`,
        handle: h,
        name: nameMap[h.toLowerCase()] || h,
        postCount: 0,
        latestPostTime: undefined,
        sourceType: "blogger",
        platform: 'X',
      })
    )
  }
}

/**
 * 取消订阅
 */
export async function isUserSubscribedToSource(
  userId: string,
  sourceId: string
): Promise<boolean> {
  try {
    const rows = await db
      .select({ sourceId: userSourceSubscriptions.sourceId })
      .from(userSourceSubscriptions)
      .where(and(
        eq(userSourceSubscriptions.userId, userId),
        eq(userSourceSubscriptions.sourceId, sourceId),
      ))
      .limit(1)

    return rows.length > 0
  } catch {
    return false
  }
}

export async function unsubscribeSource(userId: string, sourceId: string): Promise<void> {
  await db
    .delete(userSourceSubscriptions)
    .where(and(
      eq(userSourceSubscriptions.userId, userId),
      eq(userSourceSubscriptions.sourceId, sourceId),
    ))
}

/**
 * 获取用户的个性化 feed
 * 未传 `subscribedHandles` 时：先查订阅 handles 再拉 news_items；传入时可省一次往返（与首页已算好的 handles 对齐）。
 */
export async function getSubscribedFeed(
  userId: string,
  subscribedHandles?: string[]
): Promise<NewsItem[]> {
  try {
    const handles =
      subscribedHandles !== undefined
        ? subscribedHandles.map(h => h.trim()).filter(Boolean)
        : await getUserSubscribedHandles(userId)

    if (handles.length === 0) return []

    const userRecDays = await getUserRecommendationVisibleDays(userId)
    const feedSinceSub = getRecommendationFeedPublishedAtGte(userRecDays)
    const handleVariants = expandHandleQueryVariants(handles)
    const data = await db
      .select(NEWS_ITEMS_FEED_COLUMNS)
      .from(newsItems)
      .where(and(
        EXCLUDE_PLACEHOLDER_NEWS,
        inArray(newsItems.sourceHandle, handleVariants),
        gte(newsItems.publishedAt, feedSinceSub),
      ))
      .orderBy(desc(newsItems.publishedAt))

    const mapped = data.map(mapRowToNewsItem)

    const profiles = await fetchSourceProfilesByHandles(handles)
    const enriched = mergeSourceProfilesIntoPosts(mapped, profiles)
    const curated = filterPostsForPublicFeed(
      await applyRecommendationToPosts(userId, enriched),
    )
    if (curated.length === 0) {
      scheduleStaleSourceFetches(handles)
    }
    return mergeDemoPostsIfFeedEmpty(curated, handles)
  } catch (error) {
    console.error('Failed to get subscribed feed:', error)
    try {
      const handles =
        subscribedHandles !== undefined
          ? subscribedHandles.map(h => h.trim()).filter(Boolean)
          : await getUserSubscribedHandles(userId)
      const demo = mergeDemoPostsIfFeedEmpty([], handles)
      const profiles = await fetchSourceProfilesByHandles(handles)
      return mergeSourceProfilesIntoPosts(demo, profiles)
    } catch {
      return []
    }
  }
}

export type SubscribedSourcesMetaResult = {
  sources: SourceMeta[]
  /** 与 `getUserSubscribedSourceIds` 同源（订阅表全量 source_id，含侧栏未展示的孤儿行） */
  subscribedSourceIds: string[]
}

/**
 * 获取用户已订阅信息源的元数据（供 SourcesList 展示）
 * 两步查询：先取订阅记录 → 再批量查 sources 表 → 聚合 postCount
 */
export async function getSubscribedSourcesMeta(userId: string): Promise<SubscribedSourcesMetaResult> {
  try {
    const subscriptions = await db
      .select({
        sourceId: userSourceSubscriptions.sourceId,
        sourceHandle: userSourceSubscriptions.sourceHandle,
      })
      .from(userSourceSubscriptions)
      .where(eq(userSourceSubscriptions.userId, userId))

    if (subscriptions.length === 0) {
      return { sources: [], subscribedSourceIds: [] }
    }

    const subscribedSourceIds = subscriptions.map(s => String(s.sourceId))
    const sourceIds = subscriptions.map(s => s.sourceId)
    const handles = subscriptions
      .map(s => s.sourceHandle)
      .filter((h): h is string => h != null)

    const feedSince = getFeedPublishedAtGte()

    const [sourcesData, countMap] = await Promise.all([
      db.select({
        id: sources.id,
        handle: sources.handle,
        name: sources.name,
        url: sources.url,
        avatar: sources.avatar,
        description: sources.description,
        platform: sources.platform,
        enabled: sources.enabled,
        sourceType: sources.sourceType,
      }).from(sources).where(inArray(sources.id, sourceIds)),

      handles.length > 0
        ? getSourcePostStatsByHandle(handles, feedSince)
        : Promise.resolve(new Map<string, SourcePostStats>()),
    ])

    const idToSource = new Map<string, typeof sourcesData[number]>()
    for (const s of sourcesData) idToSource.set(String(s.id), s)

    const ordered: SourceMeta[] = []
    for (const sub of subscriptions) {
      const s = idToSource.get(String(sub.sourceId))
      if (!s) continue
      const h = normalizeSourceHandle(sub.sourceHandle || s.handle || '')
      const stats = countMap.get(h) || { count: 0 }
      ordered.push(
        withResolvedSourceProfile({
          id: s.id,
          handle: s.handle,
          name: s.name,
          url: s.url,
          avatar: s.avatar,
          description: s.description,
          platform: s.platform,
          enabled: s.enabled,
          postCount: stats.count,
          latestPostTime: stats.latest,
          sourceType: normalizeSourceType(s.sourceType),
        })
      )
    }
    return { sources: ordered, subscribedSourceIds }
  } catch (error) {
    console.error('Failed to get subscribed sources meta:', error)
    return { sources: [], subscribedSourceIds: [] }
  }
}

/**
 * DB 不可用时 RECOMMEND 占位（id 前缀 uai-demo-rec-，无真实外键，仅展示）。
 * 仍按 handle 合并 sources 表中的 avatar/description，有则展示真实资料。
 */
import { RECOMMENDATION_POOL } from '@/lib/recommendation-pool-data'

export { RECOMMENDED_SIDEBAR_LIMIT }

function buildExcludeHandleSet(handles: string[]): Set<string> {
  return new Set(handles.map(normalizeSourceHandle).filter(Boolean))
}

function filterOutExcludedHandles<T extends { handle: string }>(
  rows: T[],
  exclude: Set<string>
): T[] {
  if (exclude.size === 0) return rows
  return rows.filter(row => !exclude.has(normalizeSourceHandle(row.handle)))
}

function pickRecommendedSourceMetas(
  candidates: SourceMeta[],
  limit: number,
  pickRandom: boolean
): SourceMeta[] {
  const bloggers = candidates.filter((c) => (c.sourceType || 'blogger') === 'blogger')
  const others = candidates.filter((c) => (c.sourceType || 'blogger') !== 'blogger')

  if (pickRandom) {
    shuffleInPlace(bloggers)
    shuffleInPlace(others)
  } else {
    bloggers.sort((a, b) => b.postCount - a.postCount)
    others.sort((a, b) => b.postCount - a.postCount)
  }

  const picked: SourceMeta[] = []
  for (const source of bloggers) {
    if (picked.length >= limit) break
    picked.push(source)
  }
  for (const source of others) {
    if (picked.length >= limit) break
    picked.push(source)
  }
  return picked
}

async function demoRecommendedSourceMetas(
  limit: number,
  excludeHandles: string[] = []
): Promise<SourceMeta[]> {
  const exclude = buildExcludeHandleSet(excludeHandles)
  const fallbackRows = RECOMMENDATION_POOL.map((r) => ({
    handle: r.handle,
    name: r.name,
    description: r.description,
    sourceType: r.sourceType,
  }))
  const rows = filterOutExcludedHandles(fallbackRows, exclude).slice(0, Math.max(1, limit))

  if (rows.length === 0) return []

  const rowHandles = rows.map(r => r.handle)
  const byHandle = new Map<
    string,
    {
      id?: string | null
      avatar?: string | null
      description?: string | null
      name?: string | null
      url?: string | null
      platform?: string | null
    }
  >()
  try {
    const dbRows = await db
      .select({
        id: sources.id,
        handle: sources.handle,
        url: sources.url,
        avatar: sources.avatar,
        description: sources.description,
        name: sources.name,
        platform: sources.platform,
      })
      .from(sources)
      .where(inArray(sources.handle, expandHandleQueryVariants(rowHandles)))

    for (const row of dbRows) {
      byHandle.set(String(row.handle).toLowerCase(), {
        id: row.id,
        avatar: row.avatar,
        description: row.description,
        name: row.name,
        url: row.url,
        platform: row.platform,
      })
    }
  } catch {
    // 合并失败则仅用占位文案
  }

  return rows.map((r) => {
    const dbEntry = byHandle.get(r.handle.toLowerCase())
    const dbName = dbEntry?.name && String(dbEntry.name).trim()
    const resolvedId =
      dbEntry?.id && String(dbEntry.id).trim()
        ? String(dbEntry.id)
        : `uai-demo-rec-${r.handle}`
    return withResolvedSourceProfile({
      id: resolvedId,
      handle: r.handle,
      name: dbName || r.name,
      url: dbEntry?.url,
      avatar: dbEntry?.avatar,
      description: dbEntry?.description ?? r.description,
      platform: dbEntry?.platform ?? 'X',
      postCount: 0,
      sourceType: r.sourceType,
    })
  })
}

/**
 * 获取推荐池信息源（sources.in_recommendation_pool = true，排除已订阅）
 * 供 SourcesList 的"推荐关注"区块使用
 */
export async function getRecommendedSources(
  userId: string | null,
  limit = 8,
  options?: GetRecommendedSourcesOptions
): Promise<SourceMeta[]> {
  const recCols = {
    id: sources.id,
    handle: sources.handle,
    name: sources.name,
    url: sources.url,
    avatar: sources.avatar,
    description: sources.description,
    platform: sources.platform,
    sourceType: sources.sourceType,
  }

  try {
    let excludeHandles: string[] = []
    if (userId) {
      excludeHandles = await getUserSubscribedHandles(userId)
    }
    const excludeHandleSet = buildExcludeHandleSet(excludeHandles)

    const poolSources = await db
      .select(recCols)
      .from(sources)
      .where(eq(sources.inRecommendationPool, true))

    if (poolSources.length === 0) {
      return await demoRecommendedSourceMetas(limit, excludeHandles)
    }

    const pool = filterOutExcludedHandles(poolSources, excludeHandleSet)

    const poolHandles = pool
      .map(s => s.handle)
      .filter((h): h is string => typeof h === 'string' && h.length > 0)

    if (poolHandles.length === 0) {
      return await demoRecommendedSourceMetas(limit, excludeHandles)
    }

    const feedSinceRec = getFeedPublishedAtGte()
    let countMap = new Map<string, SourcePostStats>()
    try {
      countMap = await getSourcePostStatsByHandle(poolHandles, feedSinceRec)
    } catch (err) {
      console.error('Recommended sources: postCounts query failed', err)
    }

    const mapped = pool.map((s) =>
      withResolvedSourceProfile({
        id: String(s.id),
        handle: s.handle,
        name: s.name,
        url: s.url,
        avatar: s.avatar,
        description: s.description,
        platform: s.platform,
        postCount: countMap.get(normalizeSourceHandle(s.handle))?.count || 0,
        sourceType: s.sourceType,
      })
    )

    let candidates = mapped
    const exIds = options?.excludeSourceIds?.filter(Boolean) ?? []
    if (exIds.length > 0) {
      const ex = new Set(exIds.map(String))
      candidates = candidates.filter((c) => !ex.has(String(c.id)))
    }

    const exDisplayHandles = buildExcludeHandleSet(options?.excludeHandles ?? [])
    if (exDisplayHandles.size > 0) {
      candidates = candidates.filter(
        (c) => !exDisplayHandles.has(normalizeSourceHandle(c.handle))
      )
    }

    if (candidates.length === 0) {
      const retryPool = mapped.filter(
        (c) => !exDisplayHandles.has(normalizeSourceHandle(c.handle))
      )
      if (retryPool.length > 0) {
        const pickedRetry = pickRecommendedSourceMetas(retryPool, limit, !!options?.pickRandom)
        if (pickedRetry.length > 0) return pickedRetry
      }
      return await demoRecommendedSourceMetas(limit, [
        ...excludeHandles,
        ...(options?.excludeHandles ?? []),
      ])
    }

    const picked = pickRecommendedSourceMetas(candidates, limit, !!options?.pickRandom)
    if (picked.length === 0) {
      return await demoRecommendedSourceMetas(limit, excludeHandles)
    }

    return picked
  } catch (error) {
    console.error('Failed to get recommended sources:', error)
    const excludeHandles = userId ? await getUserSubscribedHandles(userId).catch(() => []) : []
    return await demoRecommendedSourceMetas(limit, excludeHandles)
  }
}

/**
 * 获取精选推荐文章（用于未登录或无订阅用户的首页 feed）
 * 按 importance_score 降序取最重要的文章
 */
export async function getTopRecommendedPosts(limit = 30): Promise<NewsItem[]> {
  const demoFallbackHandles = DEFAULT_GUEST_HANDLES
  try {
    const feedSinceTop = getFeedPublishedAtGte()
    const minScore = getFeedMinImportanceScore()
    const data = await db
      .select(NEWS_ITEMS_FEED_COLUMNS)
      .from(newsItems)
      .where(and(
        EXCLUDE_PLACEHOLDER_NEWS,
        isNotNull(newsItems.importanceScore),
        gte(newsItems.importanceScore, minScore),
        gte(newsItems.publishedAt, feedSinceTop),
      ))
      .orderBy(desc(newsItems.importanceScore), desc(newsItems.publishedAt))
      .limit(limit)

    const mapped = filterPostsForPublicFeed(data.map(mapRowToNewsItem))
    if (mapped.length === 0) {
      scheduleStaleSourceFetches(demoFallbackHandles)
    }
    return mergeDemoPostsIfFeedEmpty(mapped, demoFallbackHandles)
  } catch (error) {
    console.error('Failed to get top recommended posts:', error)
    return mergeDemoPostsIfFeedEmpty([], demoFallbackHandles)
  }
}
