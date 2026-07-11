import 'server-only'

import { db } from '@/lib/db/drizzle'
import { rawPosts, newsItems } from '@/lib/db/schema'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { fetchRawPostIdsWithActiveJobs } from '@/lib/db/processing-jobs'
import { canonicalizeExternalUrlForDedupe, parseXStatusUrl } from '@/lib/news-post-url'
import {
  canonicalNewsIdForRawPost,
  rawPostContentFingerprint,
  rawPostDedupeKeys,
} from '@/lib/news-dedupe'
import { RAW_POST_PROCESSABLE_STATUS_VALUES } from '@/lib/raw-post-queue'

/** ingest / import 旧字段 → drizzle schema；process 读取时再还原为 legacy 形态 */
export function normalizeRawPostRowForWrite(row: Record<string, unknown>): typeof rawPosts.$inferInsert {
  const rawId = String(row.id ?? '').trim()
  const rawUrl = typeof row.url === 'string' ? row.url : undefined
  const url = rawUrl ? canonicalizeExternalUrlForDedupe(rawUrl) : undefined
  const text = (row.text ?? row.content) as string | undefined
  const authorName = (row.author_name ?? row.author) as string | undefined
  const publishedAt = (row.published_at ?? row.publishedAt) as string | Date | undefined
  const parsed = url ? parseXStatusUrl(url) : null
  const id =
    canonicalNewsIdForRawPost({
      ...row,
      id: rawId,
      url,
      text,
    }) || rawId
  const contentHash =
    typeof row.content_hash === 'string' && row.content_hash.trim()
      ? row.content_hash.trim()
      : rawPostContentFingerprint({
          ...row,
          id,
          url,
          text,
        })

  return {
    id,
    url,
    author: authorName ?? parsed?.handle ?? undefined,
    content: text ?? undefined,
    title: typeof row.title === 'string' ? row.title : undefined,
    publishedAt: publishedAt ? new Date(publishedAt) : undefined,
    sourceId: typeof row.source_id === 'string' ? row.source_id : typeof row.sourceId === 'string' ? row.sourceId : undefined,
    contentHash: contentHash || undefined,
    status: typeof row.status === 'string' ? row.status : 'new',
    errorMessage: typeof row.error_message === 'string' ? row.error_message : undefined,
    urls: row.urls ?? row.link_urls ?? row.linkUrls,
    mediaUrls: row.media_urls ?? row.mediaUrls,
    socialEngagement: row.social_engagement ?? row.socialEngagement,
    referencedPost: row.referenced_post ?? row.referencedPost,
  }
}

export function normalizeRawPostRowForProcess(row: Record<string, unknown>): Record<string, unknown> {
  const url = typeof row.url === 'string' ? row.url : ''
  const parsed = parseXStatusUrl(url)
  const handleFromUrl = parsed?.handle ?? ''
  const text = (row.text ?? row.content ?? '') as string
  const authorName = (row.author_name ?? row.author ?? handleFromUrl) as string
  const handle = (row.handle ?? handleFromUrl) as string
  const publishedAt = (row.published_at ?? row.publishedAt ?? row.created_at ?? row.createdAt ?? '') as string

  return {
    ...row,
    text,
    author_name: authorName,
    handle,
    platform: row.platform ?? 'X',
    published_at: publishedAt,
    urls: row.urls ?? row.link_urls ?? row.linkUrls,
    media_urls: row.media_urls ?? row.mediaUrls,
    social_engagement: row.social_engagement ?? row.socialEngagement,
    referenced_post: row.referenced_post ?? row.referencedPost,
  }
}

/** 与 refresh/fetch、process 当前行为一致：仅 id 列 */
export async function fetchExistingRawPostIds(): Promise<string[]> {
  const rows = await db.select({ id: rawPosts.id }).from(rawPosts)
  return rows.map(r => r.id)
}

export async function fetchExistingNewsSourceUrls(): Promise<string[]> {
  const rows = await db.select({ sourceUrl: newsItems.sourceUrl }).from(newsItems)
  return rows
    .map(r => (r.sourceUrl ? canonicalizeExternalUrlForDedupe(r.sourceUrl) : ''))
    .filter(Boolean)
}

export async function fetchExistingRawPostDedupeKeys(): Promise<Set<string>> {
  const rows = await db
    .select({
      id: rawPosts.id,
      url: rawPosts.url,
      contentHash: rawPosts.contentHash,
      content: rawPosts.content,
      title: rawPosts.title,
      referencedPost: rawPosts.referencedPost,
    })
    .from(rawPosts)

  const keys = new Set<string>()
  for (const row of rows) {
    for (const key of rawPostDedupeKeys({
      id: row.id,
      url: row.url,
      content_hash: row.contentHash,
      content: row.content,
      title: row.title,
      referenced_post: row.referencedPost,
    })) {
      keys.add(key)
    }
  }
  return keys
}

export async function fetchExistingNewsDedupeKeys(): Promise<Set<string>> {
  const rows = await db
    .select({
      id: newsItems.id,
      sourceUrl: newsItems.sourceUrl,
      sourcePlatform: newsItems.sourcePlatform,
    })
    .from(newsItems)

  const keys = new Set<string>()
  for (const row of rows) {
    const id = canonicalNewsIdForRawPost({
      id: row.id,
      platform: row.sourcePlatform ?? undefined,
      url: row.sourceUrl ?? undefined,
    })
    if (id) keys.add(`id:${id}`)
    const url = row.sourceUrl ? canonicalizeExternalUrlForDedupe(row.sourceUrl) : ''
    if (url) keys.add(`url:${url}`)
  }
  return keys
}

export async function upsertRawPosts(rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return
  const normalized = rows.map(normalizeRawPostRowForWrite)
  await db
    .insert(rawPosts)
    .values(normalized)
    .onConflictDoUpdate({
      target: rawPosts.id,
      set: {
        url: sql`excluded.url`,
        author: sql`excluded.author`,
        content: sql`excluded.content`,
        title: sql`excluded.title`,
        publishedAt: sql`excluded.published_at`,
        sourceId: sql`excluded.source_id`,
        contentHash: sql`excluded.content_hash`,
        status: sql`excluded.status`,
        errorMessage: sql`excluded.error_message`,
        updatedAt: sql`excluded.updated_at`,
        urls: sql`excluded.urls`,
        mediaUrls: sql`excluded.media_urls`,
        socialEngagement: sql`excluded.social_engagement`,
        referencedPost: sql`excluded.referenced_post`,
      },
    })
}

export async function fetchRawPostsBatch(limit: number): Promise<Record<string, unknown>[]> {
  const rows = await db
    .select()
    .from(rawPosts)
    .where(inArray(rawPosts.status, RAW_POST_PROCESSABLE_STATUS_VALUES))
    .orderBy(asc(rawPosts.createdAt))
    .limit(limit)
  return (rows as unknown as Record<string, unknown>[]).map(normalizeRawPostRowForProcess)
}

export async function deleteRawPostById(id: string): Promise<void> {
  await db.delete(rawPosts).where(eq(rawPosts.id, id))
}

export async function fetchRawPostById(id: string): Promise<Record<string, unknown> | null> {
  const rows = await db.select().from(rawPosts).where(eq(rawPosts.id, id)).limit(1)
  const row = rows[0] as unknown as Record<string, unknown> | undefined
  return row ? normalizeRawPostRowForProcess(row) : null
}

const LEGACY_RAW_SCAN_CAP_DEFAULT = 500
const LEGACY_RAW_SCAN_CAP_MAX = 800

/**
 * 拉取 raw_posts，排除仍有 pending/processing job 的行（避免与 job 路径双消费）
 * @param scanCap 最多扫描行数（随 take 略调，减轻小批次时的全表头扫描）
 */
export async function fetchRawPostsExcludingActiveJobs(
  take: number,
  scanCap = Math.min(
    LEGACY_RAW_SCAN_CAP_MAX,
    Math.max(LEGACY_RAW_SCAN_CAP_DEFAULT, take * 6)
  )
): Promise<Record<string, unknown>[]> {
  const block = await fetchRawPostIdsWithActiveJobs()
  const rows = await db
    .select()
    .from(rawPosts)
    .where(inArray(rawPosts.status, RAW_POST_PROCESSABLE_STATUS_VALUES))
    .orderBy(asc(rawPosts.createdAt))
    .limit(scanCap)
  const list = (rows as unknown as Record<string, unknown>[])
    .map(normalizeRawPostRowForProcess)
    .filter(r => !block.has(r.id as string))
    .slice(0, take)
  return list
}
