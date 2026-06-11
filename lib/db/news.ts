import 'server-only'

import { db } from '@/lib/db/drizzle'
import { newsItems } from '@/lib/db/schema'
import { eq, desc, lt, gte, sql, inArray } from 'drizzle-orm'
import { sanitizeInsightPayloadForPost } from '@/lib/insight-echo-guard'
import { canonicalizeNewsSourceUrl } from '@/lib/news-post-url'
import type { InsightAnalysisPayload, LongformArticle, NewsItem, SocialEngagement, XReferencedPost } from '@/lib/types'

/** 读取/返回前修正 X 推文 status 链接（避免 profile 或错误 url 导致无法跳转原文） */
export function withCanonicalPostSourceUrl(item: NewsItem): NewsItem {
  const url = canonicalizeNewsSourceUrl(item)
  if (url === item.source.url) return item
  return { ...item, source: { ...item.source, url } }
}

function mapNewsRowToItem(row: typeof newsItems.$inferSelect): NewsItem {
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
    publishedAt: row.publishedAt instanceof Date ? row.publishedAt.toISOString() : String(row.publishedAt ?? ''),
    originalText: row.originalText ?? '',
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ''),
    importanceScore: row.importanceScore ?? undefined,
    mediaUrls: mediaUrlsFromDbJson(row.mediaUrls),
    socialEngagement: socialEngagementFromDbJson(row.socialEngagement),
    referencedPost: referencedPostFromDbJson(row.referencedPost),
    longform: longformArticleFromDbJson(row.longformJson),
  })
}

/** news_items / raw_posts 的 jsonb media_urls → NewsItem.mediaUrls */
export function mediaUrlsFromDbJson(value: unknown): string[] | undefined {
  if (value == null) return undefined
  if (!Array.isArray(value)) return undefined
  const urls = value.filter((u): u is string => typeof u === 'string' && u.startsWith('https://'))
  return urls.length > 0 ? urls : undefined
}

/** news_items.social_engagement jsonb → 前端结构 */
export function socialEngagementFromDbJson(value: unknown): SocialEngagement | undefined {
  if (value == null || typeof value !== 'object') return undefined
  const o = value as Record<string, unknown>
  const num = (a: string, b?: string): number | undefined => {
    const v = o[a] ?? (b != null ? o[b] : undefined)
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : undefined
  }
  const out: SocialEngagement = {}
  const replyCount = num('replyCount', 'reply_count')
  const retweetCount = num('retweetCount', 'retweet_count')
  const likeCount = num('likeCount', 'like_count')
  const quoteCount = num('quoteCount', 'quote_count')
  const bookmarkCount = num('bookmarkCount', 'bookmark_count')
  const impressionCount = num('impressionCount', 'impression_count')
  if (replyCount != null) out.replyCount = replyCount
  if (retweetCount != null) out.retweetCount = retweetCount
  if (likeCount != null) out.likeCount = likeCount
  if (quoteCount != null) out.quoteCount = quoteCount
  if (bookmarkCount != null) out.bookmarkCount = bookmarkCount
  if (impressionCount != null) out.impressionCount = impressionCount
  return Object.keys(out).length > 0 ? out : undefined
}

/** news_items / raw_posts 的 jsonb referenced_post → NewsItem.referencedPost */
export function referencedPostFromDbJson(value: unknown): XReferencedPost | undefined {
  if (value == null || typeof value !== 'object') return undefined
  const o = value as Record<string, unknown>
  const kind = o.kind
  if (kind !== 'retweet' && kind !== 'quote') return undefined
  const text = typeof o.text === 'string' ? o.text.trim() : ''
  if (!text) return undefined
  const id = typeof o.id === 'string' ? o.id : undefined
  const userName = typeof o.userName === 'string' ? o.userName : undefined
  const name = typeof o.name === 'string' ? o.name : undefined
  const mediaUrls = mediaUrlsFromDbJson(o.mediaUrls)
  return {
    kind,
    text,
    ...(id ? { id } : {}),
    ...(userName ? { userName } : {}),
    ...(name ? { name } : {}),
    ...(mediaUrls ? { mediaUrls } : {}),
  }
}

/**
 * 从数据库读取所有新闻项
 */
export async function getAllPosts(): Promise<NewsItem[]> {
  try {
    const data = await db.select().from(newsItems).orderBy(desc(newsItems.publishedAt))

    return data.map(mapNewsRowToItem)
  } catch (error) {
    console.error('Failed to fetch posts:', error)
    return []
  }
}

/**
 * 全库 news_items 条数与「近 24h 创建」条数（COUNT，不拉行）
 */
export async function getNewsItemsPostCountSummary(): Promise<{
  totalPosts: number
  todayPosts: number
}> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  try {
    const [allRes, recentRes] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(newsItems),
      db
        .select({ count: sql<number>`count(*)` })
        .from(newsItems)
        .where(gte(newsItems.createdAt, since)),
    ])
    return {
      totalPosts: Number(allRes[0]?.count ?? 0),
      todayPosts: Number(recentRes[0]?.count ?? 0),
    }
  } catch (error) {
    console.error('Failed to get news item counts:', error)
    return { totalPosts: 0, todayPosts: 0 }
  }
}

/**
 * 按 URL 查询新闻项
 */
export async function getPostByUrl(url: string): Promise<NewsItem | null> {
  try {
    const rows = await db
      .select()
      .from(newsItems)
      .where(eq(newsItems.sourceUrl, url))
      .limit(1)

    const data = rows[0]
    if (!data) return null

    return mapNewsRowToItem(data)
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
    const rows = await db
      .select()
      .from(newsItems)
      .where(eq(newsItems.id, id))
      .limit(1)

    const data = rows[0]
    if (!data) return null

    return mapNewsRowToItem(data)
  } catch (error) {
    console.error('Failed to fetch post by ID:', error)
    return null
  }
}

export type AddPostOptions = {
  /** S2+：与 raw_posts.id 对齐，便于溯源 */
  rawPostId?: string | null
}

export function longformArticleFromDbJson(value: unknown): LongformArticle | undefined {
  if (value == null || typeof value !== 'object') return undefined
  const o = value as Record<string, unknown>
  const url = typeof o.url === 'string' ? o.url : ''
  const resolvedUrl = typeof o.resolvedUrl === 'string' ? o.resolvedUrl : url
  const title = typeof o.title === 'string' ? o.title : ''
  const translatedContent = typeof o.translatedContent === 'string' ? o.translatedContent : ''
  if (!url || !resolvedUrl || !translatedContent.trim()) return undefined

  const article: LongformArticle = {
    url,
    resolvedUrl,
    title: title || resolvedUrl,
    sourceName: typeof o.sourceName === 'string' ? o.sourceName : '',
    excerpt:
      typeof o.excerpt === 'string'
        ? o.excerpt
        : translatedContent.slice(0, 260),
    translatedContent,
    originalWordCount:
      typeof o.originalWordCount === 'number' && Number.isFinite(o.originalWordCount)
        ? Math.max(0, Math.floor(o.originalWordCount))
        : 0,
    fetchedAt: typeof o.fetchedAt === 'string' ? o.fetchedAt : '',
  }
  if (typeof o.translatedTitle === 'string' && o.translatedTitle.trim()) {
    article.translatedTitle = o.translatedTitle
  }
  return article
}

function toDatabaseDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (Number.isFinite(parsed.getTime())) {
      return parsed
    }
  }

  return fallback
}

/**
 * 添加新闻项到数据库（按 source_url 去重，防止同一推文重复入库）
 */
export async function addPost(post: NewsItem, options?: AddPostOptions): Promise<void> {
  try {
    const normalizedId = normalizeNewsItemId(post.id)
    const canonicalUrl = canonicalizeNewsSourceUrl({ ...post, id: normalizedId })
    const now = new Date()
    const createdAt = toDatabaseDate(post.createdAt, now)

    const existing = await db
      .select({ id: newsItems.id })
      .from(newsItems)
      .where(eq(newsItems.sourceUrl, canonicalUrl))
      .limit(1)

    if (existing.length > 0) {
      return
    }

    const row: typeof newsItems.$inferInsert = {
      id: normalizedId,
      title: post.title,
      summary: post.summary,
      content: post.content,
      sourcePlatform: post.source.platform,
      sourceName: post.source.name,
      sourceHandle: post.source.handle,
      sourceUrl: canonicalUrl,
      category: post.category,
      publishedAt: toDatabaseDate(post.publishedAt, createdAt),
      originalText: post.originalText,
      createdAt,
      importanceScore: post.importanceScore ?? null,
      ...(post.mediaUrls && post.mediaUrls.length > 0
        ? { mediaUrls: post.mediaUrls }
        : {}),
      ...(post.socialEngagement && Object.keys(post.socialEngagement).length > 0
        ? { socialEngagement: post.socialEngagement }
        : {}),
      ...(post.referencedPost ? { referencedPost: post.referencedPost } : {}),
      ...(post.longform ? { longformJson: post.longform } : {}),
      ...(options?.rawPostId ? { rawPostId: options.rawPostId } : {}),
    }

    await db.insert(newsItems).values(row).onConflictDoUpdate({
      target: newsItems.id,
      set: row,
    })
  } catch (error) {
    console.error('Failed to add post:', error)
    throw error
  }
}

export type NewsItemTextPatch = Partial<{
  title: string
  summary: string
  content: string
  originalText: string
  referencedPost: XReferencedPost | null
}>

/** 批量回填脚本等：按 id 更新正文相关列 */
export async function updateNewsItemTextFields(
  id: string,
  patch: NewsItemTextPatch
): Promise<{ ok: boolean; error?: string }> {
  if (
    patch.title === undefined &&
    patch.summary === undefined &&
    patch.content === undefined &&
    patch.originalText === undefined &&
    patch.referencedPost === undefined
  ) {
    return { ok: true }
  }

  const normalizedId = normalizeNewsItemId(id)
  const row: Partial<typeof newsItems.$inferInsert> = {}
  if (patch.title !== undefined) row.title = patch.title
  if (patch.summary !== undefined) row.summary = patch.summary
  if (patch.content !== undefined) row.content = patch.content
  if (patch.originalText !== undefined) row.originalText = patch.originalText
  if (patch.referencedPost !== undefined) {
    row.referencedPost = patch.referencedPost
  }

  try {
    await db.update(newsItems).set(row).where(eq(newsItems.id, normalizedId))
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

/**
 * 删除指定来源的所有新闻项
 */
/** 与入库 id 一致（x_ → x-） */
export function normalizeNewsItemId(id: string): string {
  return String(id).replace(/^x_/, 'x-')
}

/**
 * 删除 published_at 早于保留窗口的 news_items（供 Cron；单帖详情仍可查窗口内由 feed 决定）
 */
export async function deleteNewsItemsOlderThanRetention(): Promise<{
  ok: boolean
  deleted: number | null
  error?: string
}> {
  const raw = parseInt(process.env.NEWS_RETENTION_DAYS || '30', 10)
  const days = Number.isFinite(raw) ? Math.min(365, Math.max(7, raw)) : 30
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  try {
    const deleted = await db
      .delete(newsItems)
      .where(lt(newsItems.publishedAt, cutoff))
      .returning({ id: newsItems.id })

    return { ok: true, deleted: deleted.length }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, deleted: null, error: message }
  }
}

export async function deleteNewsItemById(id: string): Promise<boolean> {
  try {
    const normalizedId = normalizeNewsItemId(id)
    const deleted = await db
      .delete(newsItems)
      .where(eq(newsItems.id, normalizedId))
      .returning({ id: newsItems.id })
    return deleted.length > 0
  } catch (error) {
    console.error('Failed to delete news item:', error)
    return false
  }
}

export async function updateNewsItemImportanceScore(
  id: string,
  importanceScore: number,
): Promise<{ ok: boolean; error?: string }> {
  const normalizedId = normalizeNewsItemId(id)
  const score = Math.min(100, Math.max(0, Math.floor(importanceScore)))
  try {
    await db
      .update(newsItems)
      .set({ importanceScore: score })
      .where(eq(newsItems.id, normalizedId))
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

export async function deletePostsByHandle(handle: string): Promise<number> {
  try {
    const deleted = await db
      .delete(newsItems)
      .where(eq(newsItems.sourceHandle, handle))
      .returning({ id: newsItems.id })

    return deleted.length
  } catch (error) {
    console.error('Failed to delete posts:', error)
    throw error
  }
}

export type InsightJsonDoc = {
  v: 1 | 2
  global?: InsightAnalysisPayload | null
  bySourcesSig: Record<string, InsightAnalysisPayload>
}

function isInsightAnalysisPayloadCore(x: unknown): x is Record<string, unknown> {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    'scores' in o &&
    'reliability' in o &&
    'review' in o &&
    'originalTranslation' in o
  )
}

function insightPayloadFromUnknown(v: unknown): InsightAnalysisPayload | null {
  if (!isInsightAnalysisPayloadCore(v)) return null
  const o = v as Record<string, unknown>
  const ref = o.originalTranslationReferenced
  return {
    scores: o.scores as InsightAnalysisPayload['scores'],
    reliability: o.reliability as InsightAnalysisPayload['reliability'],
    review: o.review as InsightAnalysisPayload['review'],
    originalTranslation: o.originalTranslation as InsightAnalysisPayload['originalTranslation'],
    originalTranslationReferenced: typeof ref === 'string' ? ref : null,
  }
}

function parseInsightJsonDoc(raw: unknown): InsightJsonDoc | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.v !== 1 && o.v !== 2) return null
  if (!o.bySourcesSig || typeof o.bySourcesSig !== 'object') return null
  const out: Record<string, InsightAnalysisPayload> = {}
  for (const [k, v] of Object.entries(o.bySourcesSig as Record<string, unknown>)) {
    const parsed = insightPayloadFromUnknown(v)
    if (parsed) out[k] = parsed
  }
  let global: InsightAnalysisPayload | null | undefined
  if (o.global !== undefined && o.global !== null) {
    global = insightPayloadFromUnknown(o.global)
  }
  return { v: o.v, bySourcesSig: out, global }
}

/**
 * 按订阅上下文签名读取已持久化的 INSIGHT（需已执行 S2 insight_json 列）
 */
export async function getInsightPayloadBySourcesSig(
  postId: string,
  sourcesSig: string
): Promise<InsightAnalysisPayload | null> {
  try {
    const rows = await db
      .select({ insightJson: newsItems.insightJson })
      .from(newsItems)
      .where(eq(newsItems.id, postId))
      .limit(1)

    const data = rows[0] ?? null
    const doc = parseInsightJsonDoc(data?.insightJson)
    if (!doc) return null
    return doc.bySourcesSig[sourcesSig] ?? null
  } catch {
    return null
  }
}

/** 优先 global；否则回退任一历史 bySourcesSig 桶（稳定按 key 排序） */
export async function getPersistedInsightForRead(postId: string): Promise<InsightAnalysisPayload | null> {
  try {
    const rows = await db
      .select({ insightJson: newsItems.insightJson })
      .from(newsItems)
      .where(eq(newsItems.id, postId))
      .limit(1)

    const data = rows[0] ?? null
    const payload = insightPayloadFromDoc(parseInsightJsonDoc(data?.insightJson))
    if (!payload) return null
    const post = await getPostById(normalizeNewsItemId(postId))
    if (!post) return payload
    return sanitizeInsightPayloadForPost(post, payload)
  } catch {
    return null
  }
}

function insightPayloadFromDoc(doc: InsightJsonDoc | null): InsightAnalysisPayload | null {
  if (!doc) return null
  if (doc.global) return doc.global
  const keys = Object.keys(doc.bySourcesSig).sort()
  for (const k of keys) {
    const p = doc.bySourcesSig[k]
    if (p) return p
  }
  return null
}

const INSIGHT_PREFETCH_IN_CHUNK = 80

/**
 * 批量读取已持久化的 INSIGHT（仅 global / bySourcesSig 回退），一次或少量 DB 往返。
 */
export async function getPersistedInsightsForReadBatch(
  postIds: string[]
): Promise<Record<string, InsightAnalysisPayload>> {
  const unique = [...new Set(postIds.map((id) => normalizeNewsItemId(id)).filter(Boolean))]
  if (unique.length === 0) return {}

  const out: Record<string, InsightAnalysisPayload> = {}

  try {
    for (let i = 0; i < unique.length; i += INSIGHT_PREFETCH_IN_CHUNK) {
      const chunk = unique.slice(i, i + INSIGHT_PREFETCH_IN_CHUNK)
      const data = await db
        .select({
          id: newsItems.id,
          insightJson: newsItems.insightJson,
          originalText: newsItems.originalText,
          referencedPost: newsItems.referencedPost,
        })
        .from(newsItems)
        .where(inArray(newsItems.id, chunk))

      for (const row of data) {
        const id = typeof row.id === 'string' ? row.id : null
        if (!id) continue
        const payload = insightPayloadFromDoc(parseInsightJsonDoc(row.insightJson))
        if (!payload) continue
        const slice = {
          originalText: typeof row.originalText === 'string' ? row.originalText : '',
          referencedPost: referencedPostFromDbJson(row.referencedPost),
        }
        out[id] = sanitizeInsightPayloadForPost(slice, payload)
      }
    }
    return out
  } catch {
    return out
  }
}

const MAX_INSIGHT_SIG_BUCKETS = 24

/**
 * 合并写入 insight_json（按 sourcesSig 分桶，避免不同订阅上下文互相覆盖）
 */
export async function mergeInsightPayloadForSourcesSig(
  postId: string,
  sourcesSig: string,
  payload: InsightAnalysisPayload
): Promise<void> {
  try {
    const rows = await db
      .select({ insightJson: newsItems.insightJson })
      .from(newsItems)
      .where(eq(newsItems.id, postId))
      .limit(1)

    const data = rows[0] ?? null

    const prev = parseInsightJsonDoc(data?.insightJson)
    const bySourcesSig: Record<string, InsightAnalysisPayload> = {
      ...(prev?.bySourcesSig ?? {}),
      [sourcesSig]: payload,
    }

    const keys = Object.keys(bySourcesSig)
    if (keys.length > MAX_INSIGHT_SIG_BUCKETS) {
      const drop = keys.slice(0, keys.length - MAX_INSIGHT_SIG_BUCKETS)
      for (const k of drop) delete bySourcesSig[k]
    }

    const doc: InsightJsonDoc = {
      v: 2,
      ...(prev != null && prev.global != null ? { global: prev.global } : {}),
      bySourcesSig,
    }

    await db
      .update(newsItems)
      .set({ insightJson: doc })
      .where(eq(newsItems.id, postId))
  } catch (e) {
    console.warn('[insight_json] persist skipped', e)
  }
}

/**
 * 写入全站共用的 INSIGHT（译文 + KEY POINTS 等），与订阅无关
 */
/** 供回填脚本读取 / 写回完整 insight_json 文档 */
export async function readInsightJsonDocForPost(postId: string): Promise<InsightJsonDoc | null> {
  try {
    const rows = await db
      .select({ insightJson: newsItems.insightJson })
      .from(newsItems)
      .where(eq(newsItems.id, normalizeNewsItemId(postId)))
      .limit(1)

    const data = rows[0] ?? null
    return parseInsightJsonDoc(data?.insightJson)
  } catch {
    return null
  }
}

export async function writeInsightJsonDocForPost(
  postId: string,
  doc: InsightJsonDoc,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await db
      .update(newsItems)
      .set({ insightJson: doc })
      .where(eq(newsItems.id, normalizeNewsItemId(postId)))

    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

export async function mergeInsightGlobalPayload(
  postId: string,
  payload: InsightAnalysisPayload
): Promise<void> {
  try {
    const rows = await db
      .select({ insightJson: newsItems.insightJson })
      .from(newsItems)
      .where(eq(newsItems.id, postId))
      .limit(1)

    const data = rows[0] ?? null

    const prev = parseInsightJsonDoc(data?.insightJson)
    const doc: InsightJsonDoc = {
      v: 2,
      global: payload,
      bySourcesSig: prev?.bySourcesSig ?? {},
    }

    await db
      .update(newsItems)
      .set({ insightJson: doc })
      .where(eq(newsItems.id, postId))
  } catch (e) {
    console.warn('[insight_json] global persist skipped', e)
  }
}
