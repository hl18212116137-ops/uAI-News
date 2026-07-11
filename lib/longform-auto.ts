import 'server-only'

import type { AIService } from '@/lib/ai/ai-service'
import {
  createLongformFromTextArticle,
  extractLongformForRawPost,
  type ExtractLongformInput,
} from '@/lib/longform'
import { enrichLongformArticle } from '@/lib/longform-enrichment'
import { parseXStatusUrl } from '@/lib/news-post-url'
import { isMostlyChinese } from '@/lib/text-locale'
import { fetchXArticleByTweetId, type XArticle } from '@/lib/x'
import type { LongformArticle, NewsItem, XReferencedPost } from '@/lib/types'

export type LongformAutoBudget = {
  remaining: number
}

export type AutoLongformContext = {
  platform?: string
  text?: string
  sourceUrl?: string
  authorName?: string
  authorHandle?: string
  urls?: unknown
  mediaUrls?: unknown
  referencedPost?: XReferencedPost | null
  xArticle?: XArticle
}

const TRAILING_URL_PUNCTUATION_RE = /[),.;!?\u3001\u3002\uff0c\uff01\uff1f\uff09\uff3d]+$/g

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  const normalized = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function isAutoEnabled(): boolean {
  return envBool('LONGFORM_AUTO_ENABLED', true)
}

export function createLongformAutoBudget(
  limit = envInt('LONGFORM_AUTO_MAX_PER_RUN', 4),
): LongformAutoBudget {
  return { remaining: Math.max(0, limit) }
}

function reserveBudget(budget?: LongformAutoBudget): boolean {
  if (!budget) return true
  if (budget.remaining <= 0) return false
  budget.remaining -= 1
  return true
}

function valuesToStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function normalizeHttpUrl(raw: string): string | null {
  try {
    const cleaned = raw.trim().replace(TRAILING_URL_PUNCTUATION_RE, '')
    const url = new URL(cleaned)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

function isStaticAssetUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase()
    return /\.(png|jpe?g|gif|webp|svg|mp4|mov|webm|zip|gz|tar|dmg|exe|pdf)$/i.test(path)
  } catch {
    return true
  }
}

function isExcludedArticleHost(url: string): boolean {
  const host = hostOf(url)
  if (!host) return true
  return (
    host === 'x.com' ||
    host === 'twitter.com' ||
    host === 't.co' ||
    host.endsWith('.x.com') ||
    host.endsWith('.twitter.com') ||
    host === 'youtube.com' ||
    host === 'youtu.be' ||
    host === 'github.com' ||
    host === 'linkedin.com' ||
    host === 'facebook.com' ||
    host === 'instagram.com' ||
    host === 'reddit.com' ||
    host.endsWith('.reddit.com') ||
    host.includes('twimg.com')
  )
}

function uniqueUrls(values: unknown[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const url = normalizeHttpUrl(value)
    if (!url) continue
    const key = url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(url)
  }
  return out
}

export function normalizeLongformSignalUrls(value: unknown): string[] {
  return uniqueUrls(valuesToStrings(value))
}

function uniqueText(values: Array<string | undefined | null>): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const cleaned = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
    const key = cleaned.toLowerCase()
    if (!cleaned || seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
  }
  return out.join('\n\n')
}

function xArticleUrlSignal(urls: string[]): boolean {
  return urls.some((url) => /(?:x\.com|twitter\.com)\/i\/article\//i.test(url))
}

function directArticleUrls(urls: string[]): string[] {
  const limit = Math.max(1, envInt('LONGFORM_AUTO_MAX_URLS_PER_POST', 3))
  return urls
    .filter((url) => !isStaticAssetUrl(url) && !isExcludedArticleHost(url))
    .slice(0, limit)
}

function getAllSignalUrls(post: NewsItem, context: AutoLongformContext): string[] {
  return uniqueUrls([
    ...valuesToStrings(context.urls),
    ...(context.referencedPost?.urls ?? []),
    ...(post.referencedPost?.urls ?? []),
  ])
}

function sourceUrlForDirectExtraction(post: NewsItem, context: AutoLongformContext): string | undefined {
  const platform = context.platform || post.source.platform
  const sourceUrl = context.sourceUrl || post.source.url
  if (platform !== 'RSS' && platform !== 'Blog') return undefined
  const url = normalizeHttpUrl(sourceUrl)
  if (!url || isStaticAssetUrl(url) || isExcludedArticleHost(url)) return undefined
  return url
}

function shouldAllowImageDiscovery(context: AutoLongformContext): boolean {
  if (!envBool('LONGFORM_AUTO_IMAGE_DISCOVERY_ENABLED', false)) return false
  return valuesToStrings(context.mediaUrls).length > 0 || (context.referencedPost?.mediaUrls?.length ?? 0) > 0
}

async function createXArticleLongform(
  article: XArticle,
  post: NewsItem,
  context: AutoLongformContext,
  aiService: AIService,
): Promise<LongformArticle | undefined> {
  const text = article.text.trim()
  if (text.length < envInt('LONGFORM_AUTO_X_ARTICLE_MIN_CHARS', 300)) return undefined

  const sourceUrl = context.sourceUrl || article.url || post.source.url
  const translate = (chunk: string) => {
    const trimmed = chunk.trim()
    if (!trimmed || isMostlyChinese(trimmed, 0.1)) return Promise.resolve(chunk)
    return aiService.translateContent(chunk)
  }
  const base = await createLongformFromTextArticle(
    {
      requestedUrl: sourceUrl,
      resolvedUrl: sourceUrl,
      title: article.title,
      sourceName: 'X',
      authorName: article.authorName || context.authorName || post.source.name,
      text,
    },
    translate,
  )

  return enrichLongformArticle(
    {
      ...base,
      url: sourceUrl,
      resolvedUrl: sourceUrl,
      discoveryMethod: 'x-article',
    },
    aiService,
  )
}

async function fetchXArticleFromPostUrl(
  post: NewsItem,
  context: AutoLongformContext,
): Promise<XArticle | undefined> {
  const sourceUrl = context.sourceUrl || post.source.url
  const parsed = parseXStatusUrl(sourceUrl)
  if (!parsed?.statusId) return undefined
  return fetchXArticleByTweetId(parsed.statusId, sourceUrl).catch((error) => {
    console.warn(`[longform auto] X article fetch skipped for ${post.id}:`, error)
    return undefined
  })
}

export async function maybeAttachAutoLongform(
  post: NewsItem,
  context: AutoLongformContext,
  aiService: AIService,
  budget?: LongformAutoBudget,
): Promise<NewsItem> {
  if (!isAutoEnabled() || post.longform?.translatedContent) return post

  const signalUrls = getAllSignalUrls(post, context)
  const directUrls = directArticleUrls(signalUrls)
  const sourceArticleUrl = sourceUrlForDirectExtraction(post, context)
  const hasXArticleSignal = Boolean(context.xArticle?.text) || xArticleUrlSignal(signalUrls)
  const allowImageDiscovery = shouldAllowImageDiscovery(context)

  if (directUrls.length === 0 && !sourceArticleUrl && !hasXArticleSignal && !allowImageDiscovery) {
    return post
  }

  if (!reserveBudget(budget)) return post

  try {
    let longform: LongformArticle | undefined

    if (context.xArticle?.text) {
      longform = await createXArticleLongform(context.xArticle, post, context, aiService)
    } else if (hasXArticleSignal) {
      const article = await fetchXArticleFromPostUrl(post, context)
      if (article) longform = await createXArticleLongform(article, post, context, aiService)
    }

    if (!longform) {
      const extractionInput: ExtractLongformInput = {
        platform: context.platform || post.source.platform,
        text: uniqueText([
          context.text,
          post.title,
          post.summary,
          post.content,
          post.originalText,
          context.referencedPost?.text,
          post.referencedPost?.text,
        ]),
        sourceUrl: sourceArticleUrl || context.sourceUrl || post.source.url,
        authorName: context.authorName || post.source.name,
        authorHandle: context.authorHandle || post.source.handle,
        urls: sourceArticleUrl ? [sourceArticleUrl, ...directUrls] : directUrls,
        mediaUrls: allowImageDiscovery ? valuesToStrings(context.mediaUrls) : [],
        referencedPost: context.referencedPost || post.referencedPost,
      }
      const extracted = await extractLongformForRawPost(
        extractionInput,
        (chunk) => aiService.translateContent(chunk),
        {
          allowImageDiscovery,
          allowTextSearch: envBool('LONGFORM_AUTO_TEXT_SEARCH_ENABLED', false),
        },
      )
      if (extracted?.translatedContent) {
        longform = await enrichLongformArticle(extracted, aiService)
      }
    }

    if (!longform?.translatedContent) return post

    return { ...post, longform }
  } catch (error) {
    console.warn(`[longform auto] skipped for ${post.id}:`, error)
    return post
  }
}
