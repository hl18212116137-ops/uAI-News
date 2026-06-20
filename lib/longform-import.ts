import 'server-only'

import { createHash } from 'crypto'
import { addPost } from '@/lib/db'
import { getDefaultAIService } from '@/lib/ai/ai-factory'
import type { AIService } from '@/lib/ai/ai-service'
import {
  createLongformFromTextArticle,
  extractLongformFromDirectUrl,
} from '@/lib/longform'
import { enrichLongformArticle, precomputeLongformInsight } from '@/lib/longform-enrichment'
import { parseXStatusUrl } from '@/lib/news-post-url'
import { fetchTweetById, fetchXArticleByTweetId, hasXArticleEntity } from '@/lib/x'
import { isMostlyChinese } from '@/lib/text-locale'
import type { LongformArticle, NewsItem } from '@/lib/types'

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const MIN_TEXT_CHARS = 300
const SUPPORTED_TEXT_EXTENSIONS = /\.(txt|md|markdown|html|htm|xml|json)$/i
const SUPPORTED_TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/xhtml+xml',
  'text/html',
  'text/markdown',
  'text/plain',
  'text/xml',
])

export type LongformImportResult = {
  post: NewsItem
}

export type LongformFileInput = {
  fileName: string
  mimeType?: string
  text: string
}

export function isSupportedLongformFile(fileName: string, mimeType?: string): boolean {
  const type = (mimeType || '').split(';')[0].trim().toLowerCase()
  return (
    !type ||
    type.startsWith('text/') ||
    SUPPORTED_TEXT_MIME_TYPES.has(type) ||
    SUPPORTED_TEXT_EXTENSIONS.test(fileName)
  )
}

export function getLongformUploadLimitBytes(): number {
  return MAX_UPLOAD_BYTES
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function normalizeHttpUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('URL 必须以 http:// 或 https:// 开头')
    }
    return url.href
  } catch (error) {
    if (error instanceof Error && error.message.includes('必须')) throw error
    throw new Error('请输入有效的文章 URL')
  }
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return 'manual-longform'
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number.parseInt(n, 10)
      return Number.isFinite(code) ? String.fromCharCode(code) : ''
    })
}

function stripHtmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<(br|hr)\b[^>]*>/gi, '\n')
      .replace(/<\/(p|div|section|article|main|h[1-6]|li|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
}

function normalizeUploadedText(rawText: string, fileName: string): string {
  const looksLikeHtml = /\.html?$/i.test(fileName) || /<\/?[a-z][\s\S]*>/i.test(rawText)
  const text = looksLikeHtml ? stripHtmlToText(rawText) : rawText
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function titleFromText(text: string, fallback: string): string {
  const firstLine = text
    .split('\n')
    .map((line) => line.trim().replace(/^#+\s*/, ''))
    .find((line) => line.length >= 4)

  return (firstLine || fallback.replace(/\.[^.]+$/, '') || '手动添加长文').slice(0, 160)
}

async function persistLongformArticle(params: {
  article: LongformArticle
  idSeed: string
  sourceUrl: string
  originalText: string
  source?: NewsItem['source']
  publishedAt?: string
  idPrefix?: string
  aiService?: AIService
}): Promise<NewsItem> {
  const now = new Date().toISOString()
  const sourceHost = hostFromUrl(params.sourceUrl)
  const title = params.article.translatedTitle || params.article.title || '手动添加长文'
  const post: NewsItem = {
    id: `${params.idPrefix || 'manual-longform'}-${sha256(params.idSeed).slice(0, 20)}`,
    title,
    summary: params.article.digestSummary || params.article.excerpt || params.article.translatedContent.slice(0, 180),
    content: params.article.translatedContent,
    source: params.source || {
      platform: 'Blog',
      name: params.article.sourceName || sourceHost || '手动添加',
      handle: sourceHost || 'manual-longform',
      url: params.sourceUrl,
    },
    category: '行业' as NewsItem['category'],
    publishedAt: params.publishedAt || now,
    originalText: (params.originalText || params.article.translatedContent).slice(0, 12000),
    createdAt: now,
    importanceScore: 85,
    longform: params.article,
  }

  await addPost(post)
  if (params.aiService) {
    await precomputeLongformInsight({
      postId: post.id,
      article: params.article,
      aiService: params.aiService,
      source: post.source,
    })
  }
  return post
}

async function importXArticleLongformFromUrl(rawUrl: string): Promise<LongformImportResult | null> {
  const parsed = parseXStatusUrl(rawUrl)
  if (!parsed) return null

  const tweet = await fetchTweetById(parsed.statusId, parsed.handle)
  if (!tweet.raw || !hasXArticleEntity(tweet.raw)) return null

  const sourceUrl = tweet.post_url || rawUrl
  const xArticle = await fetchXArticleByTweetId(parsed.statusId, sourceUrl)
  if (!xArticle) {
    throw new Error('没有抓取到这条 X 长文的正文，请稍后重试或确认链接可公开访问')
  }

  const aiService = getDefaultAIService()
  const translate = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isMostlyChinese(trimmed, 0.1)) return Promise.resolve(text)
    return aiService.translateContent(text)
  }
  const articleBase = await createLongformFromTextArticle(
    {
      requestedUrl: sourceUrl,
      resolvedUrl: sourceUrl,
      title: xArticle.title,
      sourceName: 'X',
      authorName: xArticle.authorName || tweet.author_name,
      text: xArticle.text,
    },
    translate,
  )
  const article: LongformArticle = await enrichLongformArticle({
    ...articleBase,
    url: sourceUrl,
    resolvedUrl: sourceUrl,
    discoveryMethod: 'x-article',
  }, aiService)
  const handle = (xArticle.authorHandle || tweet.handle || parsed.handle).replace(/^@/, '')
  const post = await persistLongformArticle({
    article,
    idSeed: sourceUrl,
    sourceUrl,
    originalText: xArticle.text,
    publishedAt: xArticle.createdAt || tweet.posted_at,
    idPrefix: 'x-longform',
    aiService,
    source: {
      platform: 'X',
      name: xArticle.authorName || tweet.author_name || handle,
      handle: `@${handle}`,
      url: sourceUrl,
    },
  })

  return { post }
}

export async function importLongformFromUrl(rawUrl: string): Promise<LongformImportResult> {
  const url = normalizeHttpUrl(rawUrl)
  const xArticle = await importXArticleLongformFromUrl(url)
  if (xArticle) return xArticle

  const aiService = getDefaultAIService()
  const articleBase = await extractLongformFromDirectUrl(url, (text) =>
    aiService.translateContent(text),
  )

  if (!articleBase) {
    throw new Error('没有抓取到足够完整的文章正文，请换一个原文页面或上传文本文件')
  }
  const article = await enrichLongformArticle(articleBase, aiService)

  const post = await persistLongformArticle({
    article,
    idSeed: article.resolvedUrl || article.url,
    sourceUrl: article.resolvedUrl || article.url,
    originalText: `${article.translatedTitle || article.title}\n\n${article.translatedContent}`,
    aiService,
  })

  return { post }
}

export async function importLongformFromTextFile(
  input: LongformFileInput,
): Promise<LongformImportResult> {
  if (!isSupportedLongformFile(input.fileName, input.mimeType)) {
    throw new Error('目前支持 txt、md、html 这类文本文章文件')
  }

  const text = normalizeUploadedText(input.text, input.fileName)
  if (text.length < MIN_TEXT_CHARS) {
    throw new Error('文件里的正文太短，暂时不能作为长文保存')
  }

  const digest = sha256(`${input.fileName}\n${text}`)
  const pseudoUrl = `manual-upload:${digest.slice(0, 20)}`
  const aiService = getDefaultAIService()
  const articleBase = await createLongformFromTextArticle(
    {
      requestedUrl: pseudoUrl,
      resolvedUrl: pseudoUrl,
      title: titleFromText(text, input.fileName),
      sourceName: input.fileName || '本地文件',
      text,
    },
    (chunk) => aiService.translateContent(chunk),
  )
  const article = await enrichLongformArticle(articleBase, aiService)

  const post = await persistLongformArticle({
    article,
    idSeed: pseudoUrl,
    sourceUrl: pseudoUrl,
    originalText: text,
    aiService,
  })

  return { post }
}
