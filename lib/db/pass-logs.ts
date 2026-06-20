import 'server-only'

import { pool } from '@/lib/db/drizzle'
import { addPost, mediaUrlsFromDbJson, referencedPostFromDbJson, socialEngagementFromDbJson } from '@/lib/db/news'
import { upsertRawPosts } from '@/lib/db/raw-posts'
import { getDefaultAIService } from '@/lib/ai/ai-factory'
import { ensureChineseBody, ensureChineseTitleSummary } from '@/lib/translation-guard'
import { translateNewsOriginalToChinese } from '@/lib/news-original-chinese'
import { extractXStatusIdFromPostId, parseXStatusUrl, resolveNewsPostUrl } from '@/lib/news-post-url'
import { canonicalNewsIdForPlatform } from '@/lib/news-dedupe'
import { composeTextForAiProcessing, fetchTweetById } from '@/lib/x'
import { appendImageTextsToTweetText, extractTweetImageTexts } from '@/lib/tweet-image-ocr'
import { isMostlyChinese } from '@/lib/text-locale'
import type { NewsCategory, NewsItem, XReferencedPost } from '@/lib/types'

export type PassedPostKind = 'low_signal' | 'ai_unimportant' | 'user_pass'
type PassFeedbackAction = 'promote_from_pass' | 'pass_from_feed'

export type PassedPostLog = {
  id: string
  url: string | null
  sourcePlatform: string | null
  sourceName: string | null
  sourceHandle: string | null
  content: string | null
  title: string | null
  summary: string | null
  category: string | null
  passType: PassedPostKind
  passReason: string
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  promotedAt: string | null
}

export type RecordPassedPostInput = {
  id: string
  url?: string | null
  sourcePlatform?: string | null
  sourceName?: string | null
  sourceHandle?: string | null
  content?: string | null
  title?: string | null
  summary?: string | null
  category?: string | null
  passType: PassedPostKind
  passReason: string
  publishedAt?: string | Date | null
  mediaUrls?: unknown
  socialEngagement?: unknown
  referencedPost?: unknown
}

export type PromotePassedPostsResult = {
  promoted: number
  skipped: number
  promotedIds: string[]
}

let ensurePassedPostsTablePromise: Promise<void> | null = null

function normalizeText(value: string | null | undefined, maxLength?: number): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  return maxLength && text.length > maxLength ? text.slice(0, maxLength) : text
}

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase()
}

function dateToIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return null
}

async function ensurePassedPostsTable(): Promise<void> {
  if (!ensurePassedPostsTablePromise) {
    ensurePassedPostsTablePromise = pool.query(`
      CREATE TABLE IF NOT EXISTS passed_posts (
        id text PRIMARY KEY,
        url text,
        source_platform text,
        source_name text,
        source_handle text,
        content text,
        title text,
        summary text,
        category text,
        pass_type text NOT NULL CHECK (pass_type IN ('low_signal', 'ai_unimportant', 'user_pass')),
        pass_reason text NOT NULL DEFAULT '',
        published_at timestamptz,
        media_urls jsonb,
        social_engagement jsonb,
        referenced_post jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS passed_posts_updated_at_idx ON passed_posts (updated_at DESC);
      CREATE INDEX IF NOT EXISTS passed_posts_source_handle_idx ON passed_posts (source_handle);

      CREATE TABLE IF NOT EXISTS pass_feedback (
        id text PRIMARY KEY,
        user_id uuid NOT NULL,
        passed_post_id text NOT NULL REFERENCES passed_posts (id) ON DELETE CASCADE,
        action text NOT NULL CHECK (action IN ('promote_from_pass', 'pass_from_feed')),
        source_handle text,
        pass_type text,
        pass_reason text,
        content text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS pass_feedback_user_post_action_idx
        ON pass_feedback (user_id, passed_post_id, action);
      CREATE INDEX IF NOT EXISTS pass_feedback_user_updated_at_idx
        ON pass_feedback (user_id, updated_at DESC);

      ALTER TABLE passed_posts DROP CONSTRAINT IF EXISTS passed_posts_pass_type_check;
      ALTER TABLE passed_posts
        ADD CONSTRAINT passed_posts_pass_type_check
        CHECK (pass_type IN ('low_signal', 'ai_unimportant', 'user_pass'));

      ALTER TABLE pass_feedback DROP CONSTRAINT IF EXISTS pass_feedback_action_check;
      ALTER TABLE pass_feedback
        ADD CONSTRAINT pass_feedback_action_check
        CHECK (action IN ('promote_from_pass', 'pass_from_feed'));
    `).then(() => undefined)
  }
  return ensurePassedPostsTablePromise
}

export async function recordPassedPost(input: RecordPassedPostInput): Promise<void> {
  const id = normalizeText(input.id, 220)
  if (!id) return

  await ensurePassedPostsTable()

  await pool.query(
    `
      INSERT INTO passed_posts (
        id,
        url,
        source_platform,
        source_name,
        source_handle,
        content,
        title,
        summary,
        category,
        pass_type,
        pass_reason,
        published_at,
        media_urls,
        social_engagement,
        referenced_post
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        url = excluded.url,
        source_platform = excluded.source_platform,
        source_name = excluded.source_name,
        source_handle = excluded.source_handle,
        content = excluded.content,
        title = excluded.title,
        summary = excluded.summary,
        category = excluded.category,
        pass_type = excluded.pass_type,
        pass_reason = excluded.pass_reason,
        published_at = excluded.published_at,
        media_urls = excluded.media_urls,
        social_engagement = excluded.social_engagement,
        referenced_post = excluded.referenced_post,
        updated_at = now()
    `,
    [
      id,
      normalizeText(input.url, 1000),
      normalizeText(input.sourcePlatform, 40),
      normalizeText(input.sourceName, 180),
      normalizeText(input.sourceHandle, 180),
      normalizeText(input.content, 5000),
      normalizeText(input.title, 240),
      normalizeText(input.summary, 600),
      normalizeText(input.category, 80),
      input.passType,
      normalizeText(input.passReason, 600) ?? '未记录具体原因',
      dateToIso(input.publishedAt),
      input.mediaUrls == null ? null : JSON.stringify(input.mediaUrls),
      input.socialEngagement == null ? null : JSON.stringify(input.socialEngagement),
      input.referencedPost == null ? null : JSON.stringify(input.referencedPost),
    ]
  )
}

export async function recordPassedPostSafely(input: RecordPassedPostInput): Promise<void> {
  try {
    await recordPassedPost(input)
  } catch (error) {
    console.warn('[pass-logs] record failed:', error)
  }
}

export async function listPassedPosts(options: {
  handles?: string[]
  limit?: number
  userId?: string
} = {}): Promise<PassedPostLog[]> {
  await ensurePassedPostsTable()

  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 60)))
  const handles = options.handles?.map(normalizeHandle).filter(Boolean)

  if (options.handles && (!handles || handles.length === 0)) return []

  const params: unknown[] = []
  const addParam = (value: unknown): string => {
    params.push(value)
    return `$${params.length}`
  }
  const limitParam = addParam(limit)
  const promotedAtSql = options.userId
    ? `(
        SELECT pf.updated_at
        FROM pass_feedback pf
        WHERE pf.user_id = ${addParam(options.userId)}::uuid
          AND pf.passed_post_id = passed_posts.id
          AND pf.action = 'promote_from_pass'
        ORDER BY pf.updated_at DESC
        LIMIT 1
      )`
    : 'NULL::timestamptz'
  const where = handles
    ? `WHERE lower(regexp_replace(coalesce(source_handle, ''), '^@+', '')) = ANY(${addParam(handles)}::text[])`
    : ''

  const { rows } = await pool.query(
    `
      SELECT
        id,
        url,
        source_platform,
        source_name,
        source_handle,
        content,
        title,
        summary,
        category,
        pass_type,
        pass_reason,
        published_at,
        created_at,
        updated_at,
        ${promotedAtSql} AS promoted_at
      FROM passed_posts
      ${where}
      ORDER BY updated_at DESC
      LIMIT ${limitParam}
    `,
    params
  )

  return rows.map((row) => ({
    id: String(row.id),
    url: row.url ?? null,
    sourcePlatform: row.source_platform ?? null,
    sourceName: row.source_name ?? null,
    sourceHandle: row.source_handle ?? null,
    content: row.content ?? null,
    title: row.title ?? null,
    summary: row.summary ?? null,
    category: row.category ?? null,
    passType:
      row.pass_type === 'low_signal'
        ? 'low_signal'
        : row.pass_type === 'user_pass'
          ? 'user_pass'
          : 'ai_unimportant',
    passReason: row.pass_reason || '未记录具体原因',
    publishedAt: dateToIso(row.published_at),
    createdAt: dateToIso(row.created_at) || new Date().toISOString(),
    updatedAt: dateToIso(row.updated_at) || new Date().toISOString(),
    promotedAt: dateToIso(row.promoted_at),
  }))
}

function normalizeCategory(value: unknown): NewsCategory {
  return value === '模型' || value === '产品' || value === '研究' || value === '行业' || value === '政策'
    ? value
    : '行业'
}

function snippet(value: unknown, maxLength: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function isGenericGeneratedText(value: unknown): boolean {
  const text = String(value ?? '').trim()
  return text === '未命名新闻' || text === '暂无摘要' || text === '无摘要'
}

function isPassReasonLikeText(value: unknown): boolean {
  const text = String(value ?? '').trim()
  if (!text) return false
  return /PASS|不适合展示|缺乏实质内容|缺乏具体|信息模糊|不重要|低信号|无法判断|仅表达|无具体事件|无具体信息/i.test(text)
}

function restoredTitleFromText(text: string, handle?: string | null): string {
  const content = snippet(text, 42)
  if (content) return content
  const h = normalizeText(handle ?? null, 60)
  return h ? `@${h} 的推文` : '手动恢复的推文'
}

function restoredSummaryFromText(text: string, referencedText?: string | null): string {
  const main = snippet(text, 180)
  if (main) return main
  const ref = snippet(referencedText, 180)
  if (ref) return ref
  return '这条推文由你从 PASS 列表手动恢复。'
}

function titleForPassedRow(row: Record<string, unknown>): string {
  const title = snippet(row.title, 42)
  if (title && !isGenericGeneratedText(title)) return title
  const content = snippet(row.content, 34)
  if (content) return `手动恢复：${content}`
  const handle = normalizeText(row.source_handle as string | null, 60)
  return handle ? `手动恢复 @${handle} 的内容` : '手动恢复的 PASS 内容'
}

function summaryForPassedRow(row: Record<string, unknown>): string {
  const summary = snippet(row.summary, 180)
  if (summary && !isGenericGeneratedText(summary)) return summary
  const content = snippet(row.content, 180)
  const reason = snippet(row.pass_reason, 120)
  if (content && reason) return `${reason}；原文：${content}`
  return content || reason || '这条内容由你从 PASS 列表手动恢复。'
}

function rowToNewsItem(row: Record<string, unknown>): NewsItem {
  const now = new Date().toISOString()
  const handle = normalizeText(row.source_handle as string | null, 120) ?? ''
  const content = normalizeText(row.content as string | null, 8000) || summaryForPassedRow(row)
  const publishedAt = dateToIso(row.published_at) || dateToIso(row.updated_at) || now

  return {
    id: String(row.id),
    title: titleForPassedRow(row),
    summary: summaryForPassedRow(row),
    content,
    source: {
      platform: (normalizeText(row.source_platform as string | null, 40) || 'X') as NewsItem['source']['platform'],
      name: normalizeText(row.source_name as string | null, 160) || (handle ? `@${handle}` : '未知来源'),
      handle,
      url: normalizeText(row.url as string | null, 1000) || '',
    },
    category: normalizeCategory(row.category),
    publishedAt,
    originalText: content,
    createdAt: now,
    importanceScore: 75,
    mediaUrls: mediaUrlsFromDbJson(row.media_urls),
    socialEngagement: socialEngagementFromDbJson(row.social_engagement),
    referencedPost: referencedPostFromDbJson(row.referenced_post),
  }
}

function statusIdForPassedRow(row: Record<string, unknown>): string | null {
  const parsed = parseXStatusUrl(normalizeText(row.url as string | null, 1000) || '')
  return parsed?.statusId ?? extractXStatusIdFromPostId(String(row.id))
}

async function buildRestoredNewsItem(row: Record<string, unknown>): Promise<{
  item: NewsItem
  rawPost: Record<string, unknown>
}> {
  const statusId = statusIdForPassedRow(row)
  if (!statusId) {
    const item = rowToNewsItem(row)
    return {
      item,
      rawPost: {
        id: item.id,
        platform: item.source.platform,
        handle: item.source.handle,
        author_name: item.source.name,
        text: item.originalText,
        url: item.source.url,
        published_at: item.publishedAt,
        fetched_at: new Date().toISOString(),
        ...(item.mediaUrls ? { media_urls: item.mediaUrls } : {}),
        ...(item.socialEngagement ? { social_engagement: item.socialEngagement } : {}),
        ...(item.referencedPost ? { referenced_post: item.referencedPost } : {}),
      },
    }
  }

  const tweet = await fetchTweetById(statusId, normalizeText(row.source_handle as string | null, 120) || undefined)
  const normalizedId = canonicalNewsIdForPlatform('X', tweet.post_id)
  const outerText = tweet.post_text || normalizeText(row.content as string | null, 8000) || ''
  const imageTexts = await extractTweetImageTexts({
    tweetText: outerText,
    authorName: tweet.author_name,
    authorHandle: tweet.handle,
    mediaUrls: tweet.media_urls,
    referencedPost: tweet.referencedPost,
  })
  const enrichedOuterText = appendImageTextsToTweetText(outerText, imageTexts, 'tweet')
  const referencedPost = tweet.referencedPost
    ? {
        ...tweet.referencedPost,
        text: appendImageTextsToTweetText(tweet.referencedPost.text, imageTexts, 'referenced'),
      }
    : undefined
  const textForAi = composeTextForAiProcessing(enrichedOuterText, referencedPost)
  const ai = getDefaultAIService()

  let title = restoredTitleFromText(enrichedOuterText, tweet.handle)
  let summary = restoredSummaryFromText(enrichedOuterText, referencedPost?.text)
  let category = normalizeCategory(row.category)
  try {
    const draft = await ai.processNews(textForAi, tweet.author_name, tweet.handle)
    const checked = await ensureChineseTitleSummary(ai, draft)
    if (draft.important && checked.title && !isGenericGeneratedText(checked.title)) title = checked.title
    if (
      draft.important &&
      checked.summary &&
      !isGenericGeneratedText(checked.summary) &&
      !isPassReasonLikeText(checked.summary)
    ) {
      summary = checked.summary
    }
    category = checked.category as NewsCategory
  } catch (error) {
    console.warn(`[pass-logs] AI metadata skipped for restored ${normalizedId}:`, error)
  }

  let translatedContent = textForAi
  let zhOriginal: { originalText: string; referencedPost?: XReferencedPost } = {
    originalText: enrichedOuterText,
    ...(referencedPost ? { referencedPost } : {}),
  }
  try {
    const [translatedRaw, original] = await Promise.all([
      ai.translateContent(textForAi),
      translateNewsOriginalToChinese((s) => ai.translateContent(s), enrichedOuterText, referencedPost),
    ])
    translatedContent = await ensureChineseBody(ai, translatedRaw)
    zhOriginal = original
  } catch (error) {
    console.warn(`[pass-logs] translation skipped for restored ${normalizedId}:`, error)
  }

  if (
    isGenericGeneratedText(title) ||
    isPassReasonLikeText(title) ||
    !isMostlyChinese(title, 0.12)
  ) {
    title = restoredTitleFromText(zhOriginal.originalText || enrichedOuterText, tweet.handle)
  }
  if (
    isGenericGeneratedText(summary) ||
    isPassReasonLikeText(summary) ||
    !isMostlyChinese(summary, 0.08)
  ) {
    summary = restoredSummaryFromText(translatedContent || zhOriginal.originalText, zhOriginal.referencedPost?.text)
  }

  let importanceScore = 75
  try {
    importanceScore = await ai.scoreNewsImportance({
      title,
      summary,
      content: translatedContent,
      category,
      authorName: tweet.author_name,
      authorHandle: tweet.handle,
      publishedAt: tweet.posted_at,
    })
  } catch {
    /* Keep the explicit restore score. */
  }

  const item: NewsItem = {
    id: normalizedId,
    title,
    summary,
    content: translatedContent,
    source: {
      platform: 'X',
      name: tweet.author_name,
      handle: tweet.handle,
      url: tweet.post_url,
    },
    category,
    publishedAt: tweet.posted_at,
    originalText: zhOriginal.originalText,
    createdAt: new Date().toISOString(),
    importanceScore: Math.max(75, importanceScore),
    ...(tweet.media_urls ? { mediaUrls: tweet.media_urls } : {}),
    ...(tweet.social_engagement ? { socialEngagement: tweet.social_engagement } : {}),
    ...(zhOriginal.referencedPost ? { referencedPost: zhOriginal.referencedPost } : {}),
  }

  return {
    item,
    rawPost: {
      id: item.id,
      platform: 'X',
      handle: tweet.handle,
      author_name: tweet.author_name,
      text: enrichedOuterText,
      url: tweet.post_url,
      published_at: tweet.posted_at,
      fetched_at: new Date().toISOString(),
      ...(tweet.media_urls ? { media_urls: tweet.media_urls } : {}),
      ...(tweet.social_engagement ? { social_engagement: tweet.social_engagement } : {}),
      ...(referencedPost ? { referenced_post: referencedPost } : {}),
    },
  }
}

async function recordPassFeedback(
  userId: string,
  action: PassFeedbackAction,
  row: Record<string, unknown>
): Promise<void> {
  const postId = String(row.id)
  await pool.query(
    `
      INSERT INTO pass_feedback (
        id,
        user_id,
        passed_post_id,
        action,
        source_handle,
        pass_type,
        pass_reason,
        content
      )
      VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id, passed_post_id, action) DO UPDATE SET
        source_handle = excluded.source_handle,
        pass_type = excluded.pass_type,
        pass_reason = excluded.pass_reason,
        content = excluded.content,
        updated_at = now()
    `,
    [
      `${userId}:${action}:${postId}`,
      userId,
      postId,
      action,
      normalizeText(row.source_handle as string | null, 180),
      normalizeText(row.pass_type as string | null, 40),
      normalizeText(row.pass_reason as string | null, 600),
      normalizeText(row.content as string | null, 1200),
    ]
  )
}

async function recordPromoteFeedback(userId: string, row: Record<string, unknown>): Promise<void> {
  await recordPassFeedback(userId, 'promote_from_pass', row)
}

export async function recordUserPassedPost(userId: string, post: NewsItem): Promise<void> {
  const id = normalizeText(post.id, 220)
  if (!userId || !id) return

  const content =
    normalizeText(post.originalText, 5000) ??
    normalizeText(post.content, 5000) ??
    normalizeText(post.summary, 5000)
  const passReason = '用户从信息流主动 PASS，后续应少推荐相似主题或表达。'

  await recordPassedPost({
    id,
    url: resolveNewsPostUrl(post),
    sourcePlatform: post.source?.platform ?? null,
    sourceName: post.source?.name ?? null,
    sourceHandle: post.source?.handle ?? null,
    content,
    title: post.title,
    summary: post.summary,
    category: post.category,
    passType: 'user_pass',
    passReason,
    publishedAt: post.publishedAt,
    mediaUrls: post.mediaUrls,
    socialEngagement: post.socialEngagement,
    referencedPost: post.referencedPost,
  })

  await recordPassFeedback(userId, 'pass_from_feed', {
    id,
    source_handle: post.source?.handle ?? null,
    pass_type: 'user_pass',
    pass_reason: passReason,
    content,
  })
}

export async function promotePassedPosts(options: {
  userId: string
  ids: string[]
  handles: string[]
}): Promise<PromotePassedPostsResult> {
  await ensurePassedPostsTable()

  const ids = [...new Set(options.ids.map((id) => normalizeText(id, 220)).filter((id): id is string => !!id))]
  const handles = options.handles.map(normalizeHandle).filter(Boolean)
  if (ids.length === 0 || handles.length === 0) {
    return { promoted: 0, skipped: ids.length, promotedIds: [] }
  }

  const { rows } = await pool.query(
    `
      SELECT *
      FROM passed_posts
      WHERE id = ANY($1::text[])
        AND lower(regexp_replace(coalesce(source_handle, ''), '^@+', '')) = ANY($2::text[])
      ORDER BY updated_at DESC
    `,
    [ids, handles]
  )

  const promotedIds: string[] = []
  for (const row of rows) {
    const { item, rawPost } = await buildRestoredNewsItem(row)
    await upsertRawPosts([rawPost])
    await addPost(item, { skipContentDedupe: true, refreshExisting: true })
    await recordPromoteFeedback(options.userId, row)
    promotedIds.push(item.id)
  }

  return {
    promoted: promotedIds.length,
    skipped: Math.max(0, ids.length - promotedIds.length),
    promotedIds,
  }
}

export async function getPromotedPassedPostRefsForUser(userId: string): Promise<Array<{
  id: string
  promotedAt: string
}>> {
  if (!userId) return []
  try {
    await ensurePassedPostsTable()

    const { rows } = await pool.query(
      `
        SELECT passed_post_id, max(updated_at) AS promoted_at
        FROM pass_feedback
        WHERE user_id = $1::uuid
          AND action = 'promote_from_pass'
        GROUP BY passed_post_id
        ORDER BY promoted_at DESC
        LIMIT 200
      `,
      [userId]
    )

    return rows
      .map((row) => ({
        id: String(row.passed_post_id),
        promotedAt: dateToIso(row.promoted_at) || new Date().toISOString(),
      }))
      .filter((row) => row.id)
  } catch (error) {
    console.warn('[pass-logs] promoted refs skipped:', error)
    return []
  }
}

export async function getUserPassedPostIdsForUser(userId: string, limit = 500): Promise<string[]> {
  if (!userId) return []
  try {
    await ensurePassedPostsTable()

    const safeLimit = Math.min(1000, Math.max(1, Math.floor(limit)))
    const { rows } = await pool.query(
      `
        SELECT passed_post_id
        FROM pass_feedback
        WHERE user_id = $1::uuid
          AND action = 'pass_from_feed'
        ORDER BY updated_at DESC
        LIMIT $2
      `,
      [userId, safeLimit]
    )

    return rows.map((row) => String(row.passed_post_id)).filter(Boolean)
  } catch (error) {
    console.warn('[pass-logs] passed ids skipped:', error)
    return []
  }
}

export async function getPersonalFilterLearningContextForUser(
  userId: string | null | undefined,
  handle?: string | null
): Promise<string> {
  if (!userId) return ''
  await ensurePassedPostsTable()

  const normalizedHandle = normalizeHandle(handle ?? '')
  const params: unknown[] = [userId]
  const handleClause = normalizedHandle
    ? `AND (lower(regexp_replace(coalesce(source_handle, ''), '^@+', '')) = $2 OR source_handle IS NULL OR source_handle = '')`
    : ''
  if (normalizedHandle) params.push(normalizedHandle)

  const { rows } = await pool.query(
    `
      SELECT action, source_handle, pass_type, pass_reason, content
      FROM pass_feedback
      WHERE user_id = $1::uuid
        AND action IN ('promote_from_pass', 'pass_from_feed')
        ${handleClause}
      ORDER BY updated_at DESC
      LIMIT 10
    `,
    params
  )

  if (rows.length === 0) return ''

  const userPassRows = rows.filter((row) => row.action === 'pass_from_feed')
  const restoredRows = rows.filter((row) => row.action === 'promote_from_pass')
  const lines: string[] = []

  if (userPassRows.length > 0) {
    lines.push('用户主动 PASS 过这些内容；判断 important 时，遇到相似主题、表达方式或信息密度的推文应更谨慎，除非有明确新闻价值。')
    lines.push(...userPassRows.slice(0, 5).map((row, index) => {
      const h = normalizeText(row.source_handle, 80)
      const reason = snippet(row.pass_reason, 90)
      const content = snippet(row.content, 160)
      return `${index + 1}. ${h ? `@${h} ` : ''}${row.pass_type || 'PASS'}；负反馈原因：${reason || '用户主动 PASS'}；样本：${content || '无正文'}`
    }))
  }

  if (restoredRows.length > 0) {
    lines.push('用户也曾经从 PASS 列表恢复过这些内容；遇到相似信息不要轻易 PASS。')
    lines.push(...restoredRows.slice(0, 5).map((row, index) => {
      const h = normalizeText(row.source_handle, 80)
      const reason = snippet(row.pass_reason, 90)
      const content = snippet(row.content, 160)
      return `${index + 1}. ${h ? `@${h} ` : ''}${row.pass_type || 'PASS'}；原 PASS 原因：${reason || '未记录'}；恢复样本：${content || '无正文'}`
    }))
  }

  return lines.join('\n')
}

export async function getFilterLearningContextForUser(
  userId: string | null | undefined,
  handle?: string | null
): Promise<string> {
  if (!userId) return ''
  await ensurePassedPostsTable()

  const normalizedHandle = normalizeHandle(handle ?? '')
  const params: unknown[] = [userId]
  const handleClause = normalizedHandle
    ? `AND (lower(regexp_replace(coalesce(source_handle, ''), '^@+', '')) = $2 OR source_handle IS NULL OR source_handle = '')`
    : ''
  if (normalizedHandle) params.push(normalizedHandle)

  const { rows } = await pool.query(
    `
      SELECT source_handle, pass_type, pass_reason, content
      FROM pass_feedback
      WHERE user_id = $1::uuid
        AND action = 'promote_from_pass'
        ${handleClause}
      ORDER BY updated_at DESC
      LIMIT 5
    `,
    params
  )

  if (rows.length === 0) return ''

  return [
    '用户曾经从 PASS 列表手动恢复过这些内容；判断 important 时，遇到相似信息不要轻易 PASS：',
    ...rows.map((row, index) => {
      const h = normalizeText(row.source_handle, 80)
      const reason = snippet(row.pass_reason, 90)
      const content = snippet(row.content, 160)
      return `${index + 1}. ${h ? `@${h} ` : ''}${row.pass_type || 'PASS'}；原 PASS 原因：${reason || '未记录'}；恢复样本：${content || '无正文'}`
    }),
  ].join('\n')
}
