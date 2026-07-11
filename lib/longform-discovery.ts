import 'server-only'

import type { LongformArticle, NewsItem, XReferencedPost } from '@/lib/types'
import {
  createLongformFromTextArticle,
  extractLongformForRawPost,
  type ExtractLongformInput,
} from '@/lib/longform'
import { extractXStatusIdFromPostId, parseXStatusUrl } from '@/lib/news-post-url'
import { extractTweetImageTexts } from '@/lib/tweet-image-ocr'
import {
  fetchTweetById,
  fetchTweetRepliesV2,
  fetchTweetThreadContext,
  fetchXArticleByTweetId,
  type XArticle,
  type XConversationPost,
} from '@/lib/x'
import {
  extractVideoTranscriptFromUrl,
  isLikelyVideoUrl,
  VideoTranscriptError,
} from '@/lib/video-transcript'

const URL_RE = /https?:\/\/[^\s<>"'`)\]}]+/gi

type DiscoverySource =
  | 'x-context'
  | 'x-article'
  | 'x-long-post'
  | 'x-thread'
  | 'reply-chain'
  | 'url-image'
  | 'image-ocr'
  | 'video-transcript'
  | 'text-search'

export type LongformDiscoveryAttempt = {
  source: DiscoverySource
  ok: boolean
  detail: string
}

export type LongformDiscoveryResult = {
  article?: LongformArticle
  attempts: LongformDiscoveryAttempt[]
  error?: VideoTranscriptError
}

type XContext = {
  tweetId?: string
  handleHint?: string
  text?: string
  sourceUrl?: string
  urls: string[]
  mediaUrls: string[]
  referencedPost?: XReferencedPost
  authorName?: string
  authorHandle?: string
}

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function normalizeHandle(value: string | undefined): string {
  return String(value || '').replace(/^@/, '').trim().toLowerCase()
}

function uniqueTrimmed(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const cleaned = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
    const key = cleaned.toLowerCase()
    if (!cleaned || seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
  }
  return out
}

function uniqueUrls(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const cleaned = typeof value === 'string' ? value.trim() : ''
    if (!/^https?:\/\//i.test(cleaned)) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
  }
  return out
}

function urlsFromText(text: string | undefined | null): string[] {
  if (typeof text !== 'string' || !text.trim()) return []
  return Array.from(text.matchAll(URL_RE), (match) => match[0])
}

function mergeReferencedPost(
  existing: XReferencedPost | undefined,
  fresh: XReferencedPost | undefined,
): XReferencedPost | undefined {
  if (!existing) return fresh
  if (!fresh) return existing

  const urls = uniqueUrls([...(fresh.urls ?? []), ...(existing.urls ?? [])])
  const mediaUrls = uniqueUrls([...(fresh.mediaUrls ?? []), ...(existing.mediaUrls ?? [])])

  return {
    kind: fresh.kind || existing.kind,
    text: fresh.text || existing.text,
    ...(fresh.id || existing.id ? { id: fresh.id || existing.id } : {}),
    ...(fresh.userName || existing.userName ? { userName: fresh.userName || existing.userName } : {}),
    ...(fresh.name || existing.name ? { name: fresh.name || existing.name } : {}),
    ...(urls.length > 0 ? { urls } : {}),
    ...(mediaUrls.length > 0 ? { mediaUrls } : {}),
  }
}

function buildExtractionText(post: NewsItem, context: XContext, referencedPost?: XReferencedPost): string {
  return uniqueTrimmed([
    post.title,
    post.summary,
    post.content,
    post.originalText,
    post.referencedPost?.text,
    context.text,
    referencedPost?.text,
  ]).join('\n\n')
}

function firstLineTitle(text: string, fallback: string): string {
  const first = text
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean)
  return (first || fallback || 'Longform').slice(0, 160)
}

async function createTextLongform(input: {
  text: string
  title: string
  sourceName: string
  authorName?: string
  sourceUrl: string
  discoveryMethod: NonNullable<LongformArticle['discoveryMethod']>
  translate: (text: string) => Promise<string>
}): Promise<LongformArticle> {
  return createLongformFromTextArticle(
    {
      requestedUrl: input.sourceUrl,
      resolvedUrl: input.sourceUrl,
      title: input.title,
      sourceName: input.sourceName,
      authorName: input.authorName,
      text: input.text,
      discoveryMethod: input.discoveryMethod,
    },
    input.translate,
  )
}

async function refreshXContext(post: NewsItem, attempts: LongformDiscoveryAttempt[]): Promise<XContext> {
  if (post.source.platform !== 'X') {
    attempts.push({ source: 'x-context', ok: false, detail: 'not an X post' })
    return { urls: [], mediaUrls: [] }
  }

  const sourceStatus = parseXStatusUrl(post.source.url)
  const tweetId = sourceStatus?.statusId || extractXStatusIdFromPostId(post.id)
  const handleHint = sourceStatus?.handle || post.source.handle.replace(/^@/, '') || undefined
  if (!tweetId) {
    attempts.push({ source: 'x-context', ok: false, detail: 'tweet id not found' })
    return { urls: [], mediaUrls: [], handleHint }
  }

  try {
    const fresh = await fetchTweetById(tweetId, handleHint)
    attempts.push({ source: 'x-context', ok: true, detail: 'fresh tweet context loaded' })
    return {
      tweetId,
      handleHint,
      text: fresh.post_text,
      sourceUrl: fresh.post_url,
      urls: uniqueUrls(fresh.urls ?? []),
      mediaUrls: uniqueUrls(fresh.media_urls ?? []),
      referencedPost: fresh.referencedPost,
      authorName: fresh.author_name,
      authorHandle: fresh.handle,
    }
  } catch (error) {
    attempts.push({
      source: 'x-context',
      ok: false,
      detail: error instanceof Error ? error.message : 'refresh failed',
    })
    return { tweetId, handleHint, urls: [], mediaUrls: [] }
  }
}

async function tryXArticle(input: {
  post: NewsItem
  context: XContext
  translate: (text: string) => Promise<string>
  attempts: LongformDiscoveryAttempt[]
}): Promise<LongformArticle | undefined> {
  if (!input.context.tweetId) {
    input.attempts.push({ source: 'x-article', ok: false, detail: 'tweet id not available' })
    return undefined
  }

  let article: XArticle | undefined
  try {
    article = await fetchXArticleByTweetId(
      input.context.tweetId,
      input.context.sourceUrl || input.post.source.url,
    )
  } catch (error) {
    input.attempts.push({
      source: 'x-article',
      ok: false,
      detail: error instanceof Error ? error.message : 'article fetch failed',
    })
    return undefined
  }

  const text = article?.text?.trim() || ''
  if (text.length < envInt('LONGFORM_X_ARTICLE_MIN_CHARS', 300)) {
    input.attempts.push({ source: 'x-article', ok: false, detail: 'no X Article body' })
    return undefined
  }

  input.attempts.push({ source: 'x-article', ok: true, detail: `${text.length} chars` })
  return createTextLongform({
    text,
    title: article?.title || input.post.title,
    sourceName: 'X',
    authorName: article?.authorName || input.context.authorName || input.post.source.name,
    sourceUrl: input.context.sourceUrl || article?.url || input.post.source.url,
    discoveryMethod: 'x-article',
    translate: input.translate,
  })
}

async function tryXLongPost(input: {
  post: NewsItem
  context: XContext
  translate: (text: string) => Promise<string>
  attempts: LongformDiscoveryAttempt[]
}): Promise<LongformArticle | undefined> {
  const text = uniqueTrimmed([input.context.text, input.post.originalText, input.post.content]).join('\n\n')
  const minChars = envInt('LONGFORM_X_LONG_POST_MIN_CHARS', 1400)
  if (text.length < minChars) {
    input.attempts.push({ source: 'x-long-post', ok: false, detail: `${text.length}/${minChars} chars` })
    return undefined
  }

  input.attempts.push({ source: 'x-long-post', ok: true, detail: `${text.length} chars` })
  return createTextLongform({
    text,
    title: input.post.title || firstLineTitle(text, 'X long post'),
    sourceName: 'X',
    authorName: input.context.authorName || input.post.source.name,
    sourceUrl: input.context.sourceUrl || input.post.source.url,
    discoveryMethod: 'x-long-post',
    translate: input.translate,
  })
}

function uniqueConversationPosts(posts: XConversationPost[]): XConversationPost[] {
  const seen = new Set<string>()
  const out: XConversationPost[] = []
  for (const post of posts) {
    if (!post.post_id || seen.has(post.post_id)) continue
    seen.add(post.post_id)
    out.push(post)
  }
  return out.sort((a, b) => new Date(a.posted_at).getTime() - new Date(b.posted_at).getTime())
}

function isSameAuthor(post: XConversationPost, handle: string): boolean {
  return normalizeHandle(post.handle) === handle
}

function isLikelyInteractionReply(text: string): boolean {
  const clean = text.trim()
  if (clean.length >= 180) return false
  if (/^@\w+/.test(clean)) return true
  return /^(thanks|thank you|agree|yes|no|lol|haha|exactly|same|interesting|great|nice)[.!?\s]*$/i.test(clean)
}

function stitchConversation(posts: XConversationPost[]): string {
  return uniqueTrimmed(
    posts
      .map((post) => post.post_text)
      .filter((text) => !isLikelyInteractionReply(text)),
  ).join('\n\n')
}

async function tryThreadContext(input: {
  post: NewsItem
  context: XContext
  translate: (text: string) => Promise<string>
  attempts: LongformDiscoveryAttempt[]
}): Promise<LongformArticle | undefined> {
  const tweetId = input.context.tweetId
  const handle = normalizeHandle(input.context.authorHandle || input.context.handleHint || input.post.source.handle)
  if (!tweetId || !handle) {
    input.attempts.push({ source: 'x-thread', ok: false, detail: 'tweet id or author missing' })
    return undefined
  }

  const maxPages = envInt('LONGFORM_THREAD_CONTEXT_MAX_PAGES', 2)
  const posts: XConversationPost[] = []
  let cursor: string | undefined
  for (let page = 0; page < maxPages; page += 1) {
    try {
      const result = await fetchTweetThreadContext(tweetId, { cursor, handleHint: handle })
      posts.push(...result.posts)
      cursor = result.nextCursor
      if (!cursor) break
    } catch (error) {
      input.attempts.push({
        source: 'x-thread',
        ok: false,
        detail: error instanceof Error ? error.message : 'thread context failed',
      })
      return undefined
    }
  }

  const sameAuthorPosts = uniqueConversationPosts(posts.filter((item) => isSameAuthor(item, handle)))
  const text = stitchConversation(sameAuthorPosts)
  const minChars = envInt('LONGFORM_THREAD_MIN_CHARS', 1800)
  if (sameAuthorPosts.length < 2 || text.length < minChars) {
    input.attempts.push({
      source: 'x-thread',
      ok: false,
      detail: `${sameAuthorPosts.length} posts, ${text.length}/${minChars} chars`,
    })
    return undefined
  }

  input.attempts.push({ source: 'x-thread', ok: true, detail: `${sameAuthorPosts.length} posts` })
  return createTextLongform({
    text,
    title: input.post.title || firstLineTitle(text, 'X thread'),
    sourceName: 'X',
    authorName: input.context.authorName || input.post.source.name,
    sourceUrl: input.context.sourceUrl || input.post.source.url,
    discoveryMethod: 'x-thread',
    translate: input.translate,
  })
}

async function tryReplyChain(input: {
  post: NewsItem
  context: XContext
  translate: (text: string) => Promise<string>
  attempts: LongformDiscoveryAttempt[]
}): Promise<LongformArticle | undefined> {
  const tweetId = input.context.tweetId
  const handle = normalizeHandle(input.context.authorHandle || input.context.handleHint || input.post.source.handle)
  if (!tweetId || !handle) {
    input.attempts.push({ source: 'reply-chain', ok: false, detail: 'tweet id or author missing' })
    return undefined
  }

  const maxPages = envInt('LONGFORM_REPLY_CHAIN_MAX_PAGES', 3)
  const replies: XConversationPost[] = []
  let cursor: string | undefined
  for (let page = 0; page < maxPages; page += 1) {
    try {
      const result = await fetchTweetRepliesV2(tweetId, { cursor, sort: 'Latest', handleHint: handle })
      replies.push(...result.replies)
      cursor = result.nextCursor
      if (!cursor) break
    } catch (error) {
      input.attempts.push({
        source: 'reply-chain',
        ok: false,
        detail: error instanceof Error ? error.message : 'reply fetch failed',
      })
      return undefined
    }
  }

  const chainIds = new Set([tweetId])
  const sameAuthorReplies: XConversationPost[] = []
  for (const reply of uniqueConversationPosts(replies.filter((item) => isSameAuthor(item, handle)))) {
    if (!reply.in_reply_to_id || chainIds.has(reply.in_reply_to_id) || sameAuthorReplies.length === 0) {
      sameAuthorReplies.push(reply)
      chainIds.add(reply.post_id)
    }
  }

  const root: XConversationPost = {
    post_id: tweetId,
    post_text: input.context.text || input.post.originalText || input.post.content,
    post_url: input.context.sourceUrl || input.post.source.url,
    posted_at: input.post.publishedAt,
    author_name: input.context.authorName || input.post.source.name,
    handle,
  }
  const text = stitchConversation([root, ...sameAuthorReplies])
  const minChars = envInt('LONGFORM_THREAD_MIN_CHARS', 1800)
  if (sameAuthorReplies.length === 0 || text.length < minChars) {
    input.attempts.push({
      source: 'reply-chain',
      ok: false,
      detail: `${sameAuthorReplies.length} replies, ${text.length}/${minChars} chars`,
    })
    return undefined
  }

  input.attempts.push({ source: 'reply-chain', ok: true, detail: `${sameAuthorReplies.length} replies` })
  return createTextLongform({
    text,
    title: input.post.title || firstLineTitle(text, 'X reply chain'),
    sourceName: 'X',
    authorName: input.context.authorName || input.post.source.name,
    sourceUrl: input.context.sourceUrl || input.post.source.url,
    discoveryMethod: 'reply-chain',
    translate: input.translate,
  })
}

function buildExtractInput(post: NewsItem, context: XContext, referencedPost?: XReferencedPost): ExtractLongformInput {
  return {
    platform: post.source.platform,
    text: buildExtractionText(post, context, referencedPost),
    sourceUrl: context.sourceUrl || post.source.url,
    authorName: context.authorName || post.source.name,
    authorHandle: context.authorHandle || post.source.handle,
    urls: uniqueUrls([...(context.urls ?? []), ...(referencedPost?.urls ?? [])]),
    mediaUrls: uniqueUrls([...(post.mediaUrls ?? []), ...(context.mediaUrls ?? [])]),
    referencedPost,
  }
}

async function tryUrlAndImage(input: {
  extractInput: ExtractLongformInput
  translate: (text: string) => Promise<string>
  attempts: LongformDiscoveryAttempt[]
}): Promise<LongformArticle | undefined> {
  const article = await extractLongformForRawPost(input.extractInput, input.translate, {
    allowTextSearch: false,
  })
  if (article?.translatedContent) {
    input.attempts.push({
      source: 'url-image',
      ok: true,
      detail: article.discoveryMethod || 'url',
    })
    return article
  }

  input.attempts.push({ source: 'url-image', ok: false, detail: 'no direct article or source screenshot match' })
  return undefined
}

async function tryImageOcr(input: {
  post: NewsItem
  context: XContext
  referencedPost?: XReferencedPost
  extractInput: ExtractLongformInput
  translate: (text: string) => Promise<string>
  attempts: LongformDiscoveryAttempt[]
}): Promise<LongformArticle | undefined> {
  const imageTexts = await extractTweetImageTexts({
    tweetText: input.extractInput.text,
    authorName: input.extractInput.authorName,
    authorHandle: input.extractInput.authorHandle,
    mediaUrls: input.extractInput.mediaUrls,
    referencedPost: input.referencedPost,
  })
  const text = uniqueTrimmed(imageTexts.map((item) => item.text)).join('\n\n')
  const minChars = envInt('LONGFORM_IMAGE_OCR_MIN_CHARS', 1000)
  if (text.length < minChars) {
    input.attempts.push({ source: 'image-ocr', ok: false, detail: `${text.length}/${minChars} chars` })
    return undefined
  }

  const confidence = Math.max(...imageTexts.map((item) => item.confidence ?? 0))
  input.attempts.push({ source: 'image-ocr', ok: true, detail: `${imageTexts.length} images` })
  const article = await createTextLongform({
    text,
    title: input.post.title || firstLineTitle(text, 'Image OCR longform'),
    sourceName: 'X screenshot',
    authorName: input.context.authorName || input.post.source.name,
    sourceUrl: input.context.sourceUrl || input.post.source.url,
    discoveryMethod: 'image-ocr',
    translate: input.translate,
  })

  return {
    ...article,
    ...(imageTexts[0]?.imageUrl ? { discoverySourceImageUrl: imageTexts[0].imageUrl } : {}),
    ...(confidence > 0 ? { confidence } : {}),
  }
}

function collectVideoUrls(post: NewsItem, context: XContext, referencedPost?: XReferencedPost): string[] {
  const candidates = uniqueUrls([
    ...context.urls,
    ...context.mediaUrls,
    ...(post.mediaUrls ?? []),
    ...(referencedPost?.urls ?? []),
    ...(referencedPost?.mediaUrls ?? []),
    post.source.platform === 'YouTube' ? post.source.url : undefined,
  ])
  return candidates.filter(isLikelyVideoUrl)
}

function collectLinkedPageUrls(post: NewsItem, context: XContext, referencedPost?: XReferencedPost): string[] {
  return uniqueUrls([
    ...context.urls,
    ...(referencedPost?.urls ?? []),
    ...urlsFromText(context.text),
    ...urlsFromText(post.originalText),
    ...urlsFromText(post.content),
    ...urlsFromText(referencedPost?.text),
    post.source.platform === 'YouTube' ? post.source.url : undefined,
  ])
}

function shouldRequireVideoTranscript(post: NewsItem, context: XContext, referencedPost?: XReferencedPost): boolean {
  const pageUrls = collectLinkedPageUrls(post, context, referencedPost)
  return pageUrls.length > 0 && pageUrls.every(isLikelyVideoUrl)
}

async function tryVideoTranscript(input: {
  post: NewsItem
  context: XContext
  referencedPost?: XReferencedPost
  translate: (text: string) => Promise<string>
  attempts: LongformDiscoveryAttempt[]
}): Promise<{ article?: LongformArticle; error?: VideoTranscriptError }> {
  const urls = collectVideoUrls(input.post, input.context, input.referencedPost)
  if (urls.length === 0) {
    input.attempts.push({ source: 'video-transcript', ok: false, detail: 'no video URL' })
    return {}
  }

  let lastError: VideoTranscriptError | undefined
  for (const url of urls.slice(0, envInt('LONGFORM_VIDEO_TRANSCRIPT_MAX_URLS', 2))) {
    try {
      const result = await extractVideoTranscriptFromUrl(url)
      const minChars = envInt('LONGFORM_VIDEO_TRANSCRIPT_MIN_CHARS', 1200)
      if (result.transcript.length < minChars) {
        input.attempts.push({
          source: 'video-transcript',
          ok: false,
          detail: `${result.transcript.length}/${minChars} chars`,
        })
        continue
      }

      input.attempts.push({ source: 'video-transcript', ok: true, detail: url })
      return {
        article: await createTextLongform({
          text: result.transcript,
          title: input.post.title || firstLineTitle(result.transcript, 'Video transcript'),
          sourceName: 'Video transcript',
          authorName: input.context.authorName || input.post.source.name,
          sourceUrl: url,
          discoveryMethod: 'video-transcript',
          translate: input.translate,
        }),
      }
    } catch (error) {
      lastError =
        error instanceof VideoTranscriptError
          ? error
          : new VideoTranscriptError('FAILED', error instanceof Error ? error.message : 'video transcript failed')
      input.attempts.push({
        source: 'video-transcript',
        ok: false,
        detail: `${lastError.code}: ${lastError.message}`,
      })
    }
  }

  return { error: lastError }
}

async function tryTextSearch(input: {
  extractInput: ExtractLongformInput
  translate: (text: string) => Promise<string>
  attempts: LongformDiscoveryAttempt[]
}): Promise<LongformArticle | undefined> {
  const article = await extractLongformForRawPost(input.extractInput, input.translate, {
    allowImageDiscovery: false,
  })
  if (article?.translatedContent) {
    input.attempts.push({ source: 'text-search', ok: true, detail: article.discoveryMethod || 'text-search' })
    return article
  }

  input.attempts.push({ source: 'text-search', ok: false, detail: 'no text-search candidate' })
  return undefined
}

export async function discoverLongformForPost(input: {
  post: NewsItem
  translate: (text: string) => Promise<string>
}): Promise<LongformDiscoveryResult> {
  const attempts: LongformDiscoveryAttempt[] = []
  const context = await refreshXContext(input.post, attempts)
  const referencedPost = mergeReferencedPost(input.post.referencedPost, context.referencedPost)
  const extractInput = buildExtractInput(input.post, context, referencedPost)

  const xArticle = await tryXArticle({ ...input, context, attempts })
  if (xArticle) return { article: xArticle, attempts }

  const xLongPost = await tryXLongPost({ ...input, context, attempts })
  if (xLongPost) return { article: xLongPost, attempts }

  const thread = await tryThreadContext({ ...input, context, attempts })
  if (thread) return { article: thread, attempts }

  const replyChain = await tryReplyChain({ ...input, context, attempts })
  if (replyChain) return { article: replyChain, attempts }

  const requiresVideoTranscript = shouldRequireVideoTranscript(input.post, context, referencedPost)
  if (requiresVideoTranscript) {
    const video = await tryVideoTranscript({ ...input, context, referencedPost, attempts })
    if (video.article) return { article: video.article, attempts }
    return { attempts, error: video.error }
  }

  const urlImage = await tryUrlAndImage({ extractInput, translate: input.translate, attempts })
  if (urlImage) return { article: urlImage, attempts }

  const imageOcr = await tryImageOcr({ ...input, context, referencedPost, extractInput, attempts })
  if (imageOcr) return { article: imageOcr, attempts }

  const video = await tryVideoTranscript({ ...input, context, referencedPost, attempts })
  if (video.article) return { article: video.article, attempts }

  const textSearch = await tryTextSearch({ extractInput, translate: input.translate, attempts })
  if (textSearch) return { article: textSearch, attempts }

  return { attempts, error: video.error }
}

export function formatLongformDiscoveryFailure(attempts: LongformDiscoveryAttempt[]): string {
  const tried = attempts
    .map((attempt) => `${attempt.source}: ${attempt.ok ? 'ok' : attempt.detail}`)
    .join('；')
  return `没有识别到可转成长文的内容。已尝试：${tried || '无可用来源'}`
}
