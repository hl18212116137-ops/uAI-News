import 'server-only'

import { supabase } from '@/lib/supabase'
import type { InsightAnalysisPayload, NewsItem, SocialEngagement, XReferencedPost } from '@/lib/types'

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
      mediaUrls: mediaUrlsFromDbJson(row.media_urls),
      socialEngagement: socialEngagementFromDbJson(row.social_engagement),
      referencedPost: referencedPostFromDbJson(row.referenced_post),
    })) as NewsItem[]
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
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  try {
    const [allRes, recentRes] = await Promise.all([
      supabase.from('news_items').select('id', { count: 'exact', head: true }),
      supabase
        .from('news_items')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since),
    ])
    if (allRes.error) {
      console.error('Failed to count news_items:', allRes.error)
    }
    if (recentRes.error) {
      console.error('Failed to count recent news_items:', recentRes.error)
    }
    return {
      totalPosts: allRes.count ?? 0,
      todayPosts: recentRes.count ?? 0,
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
    const { data, error } = await supabase
      .from('news_items')
      .select('*')
      .eq('source_url', url)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
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
      mediaUrls: mediaUrlsFromDbJson(data.media_urls),
      socialEngagement: socialEngagementFromDbJson(data.social_engagement),
      referencedPost: referencedPostFromDbJson(data.referenced_post),
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
      mediaUrls: mediaUrlsFromDbJson(data.media_urls),
      socialEngagement: socialEngagementFromDbJson(data.social_engagement),
      referencedPost: referencedPostFromDbJson(data.referenced_post),
    } as NewsItem
  } catch (error) {
    console.error('Failed to fetch post by ID:', error)
    return null
  }
}

export type AddPostOptions = {
  /** S2+：与 raw_posts.id 对齐，便于溯源 */
  rawPostId?: string | null
}

/**
 * 添加新闻项到数据库（按 source_url 去重，防止同一推文重复入库）
 */
export async function addPost(post: NewsItem, options?: AddPostOptions): Promise<void> {
  try {
    const normalizedId = normalizeNewsItemId(post.id)

    const { data: existing } = await supabase
      .from('news_items')
      .select('id')
      .eq('source_url', post.source.url)
      .single()

    if (existing) {
      return
    }

    const row: Record<string, unknown> = {
      id: normalizedId,
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
      ...(post.mediaUrls && post.mediaUrls.length > 0
        ? { media_urls: post.mediaUrls }
        : {}),
      ...(post.socialEngagement && Object.keys(post.socialEngagement).length > 0
        ? { social_engagement: post.socialEngagement }
        : {}),
      ...(post.referencedPost ? { referenced_post: post.referencedPost } : {}),
    }

    if (options?.rawPostId) {
      row.raw_post_id = options.rawPostId
    }

    const { error } = await supabase.from('news_items').upsert(row, { onConflict: 'id' })

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
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  try {
    const { error, count } = await supabase
      .from('news_items')
      .delete({ count: 'exact' })
      .lt('published_at', cutoff)

    if (error) {
      console.error('deleteNewsItemsOlderThanRetention:', error)
      return { ok: false, deleted: null, error: error.message }
    }
    return { ok: true, deleted: count ?? null }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, deleted: null, error: message }
  }
}

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

type InsightJsonDoc = {
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
    'contextMatch' in o &&
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
    contextMatch: o.contextMatch as InsightAnalysisPayload['contextMatch'],
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
    const { data, error } = await supabase
      .from('news_items')
      .select('insight_json')
      .eq('id', postId)
      .maybeSingle()

    if (error) {
      console.error('getInsightPayloadBySourcesSig:', error)
      return null
    }

    const doc = parseInsightJsonDoc(data?.insight_json)
    if (!doc) return null
    return doc.bySourcesSig[sourcesSig] ?? null
  } catch {
    return null
  }
}

/** 优先 global；否则回退任一历史 bySourcesSig 桶（稳定按 key 排序） */
export async function getPersistedInsightForRead(postId: string): Promise<InsightAnalysisPayload | null> {
  try {
    const { data, error } = await supabase
      .from('news_items')
      .select('insight_json')
      .eq('id', postId)
      .maybeSingle()

    if (error) {
      console.error('getPersistedInsightForRead:', error)
      return null
    }

    const doc = parseInsightJsonDoc(data?.insight_json)
    if (!doc) return null
    if (doc.global) return doc.global
    const keys = Object.keys(doc.bySourcesSig).sort()
    for (const k of keys) {
      const p = doc.bySourcesSig[k]
      if (p) return p
    }
    return null
  } catch {
    return null
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
    const { data, error } = await supabase
      .from('news_items')
      .select('insight_json')
      .eq('id', postId)
      .maybeSingle()

    if (error) {
      console.warn('[insight_json] read skipped:', error.message)
      return
    }

    const prev = parseInsightJsonDoc(data?.insight_json)
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

    const { error: upErr } = await supabase
      .from('news_items')
      .update({ insight_json: doc })
      .eq('id', postId)

    if (upErr) {
      console.warn('[insight_json] update skipped:', upErr.message)
    }
  } catch (e) {
    console.warn('[insight_json] persist skipped', e)
  }
}

/**
 * 写入全站共用的 INSIGHT（译文 + KEY POINTS 等），与订阅无关
 */
export async function mergeInsightGlobalPayload(
  postId: string,
  payload: InsightAnalysisPayload
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('news_items')
      .select('insight_json')
      .eq('id', postId)
      .maybeSingle()

    if (error) {
      console.warn('[insight_json] global read skipped:', error.message)
      return
    }

    const prev = parseInsightJsonDoc(data?.insight_json)
    const doc: InsightJsonDoc = {
      v: 2,
      global: payload,
      bySourcesSig: prev?.bySourcesSig ?? {},
    }

    const { error: upErr } = await supabase
      .from('news_items')
      .update({ insight_json: doc })
      .eq('id', postId)

    if (upErr) {
      console.warn('[insight_json] global update skipped:', upErr.message)
    }
  } catch (e) {
    console.warn('[insight_json] global persist skipped', e)
  }
}
