import 'server-only'

import type { LongformArticle } from '@/lib/types'

type ExtractLongformInput = {
  platform: string
  text: string
  sourceUrl: string
  authorName: string
  authorHandle: string
}

type CandidateArticle = {
  requestedUrl: string
  resolvedUrl: string
  title: string
  sourceName: string
  authorName?: string
  text: string
  originalWordCount: number
}

const URL_RE = /https?:\/\/[^\s<>"'）)\]}，。！？、]+/gi
const HTML_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 uAI-News-Longform/1.0'
const DEFAULT_MIN_CHARS = 1800
const DEFAULT_MAX_TRANSLATE_CHARS = 12000
const TRANSLATE_CHUNK_CHARS = 2800

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function isEnabled(): boolean {
  const raw = process.env.LONGFORM_EXTRACTION_ENABLED
  return raw == null || raw === '' || raw === '1' || raw.toLowerCase() === 'true'
}

function normalizeCandidateUrl(raw: string): string | null {
  try {
    const cleaned = raw.trim().replace(/[),.;!?，。！？、]+$/g, '')
    const u = new URL(cleaned)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u.href
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

function sourceNameFromUrl(url: string): string {
  const host = hostOf(url)
  if (!host) return '原文'
  return host
    .split('.')
    .filter(Boolean)
    .slice(-2)
    .join('.')
}

function isExcludedLongformHost(url: string): boolean {
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

function looksLikeStaticAsset(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase()
    return /\.(png|jpe?g|gif|webp|svg|mp4|mov|webm|zip|gz|tar|dmg|exe)$/i.test(path)
  } catch {
    return true
  }
}

function extractCandidateUrls(input: ExtractLongformInput): string[] {
  const out = new Set<string>()
  const text = input.text || ''
  for (const match of text.matchAll(URL_RE)) {
    const url = normalizeCandidateUrl(match[0])
    if (url) out.add(url)
  }

  if ((input.platform === 'RSS' || input.platform === 'Blog') && input.sourceUrl) {
    const url = normalizeCandidateUrl(input.sourceUrl)
    if (url) out.add(url)
  }

  return Array.from(out).filter((url) => !looksLikeStaticAsset(url))
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
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<(br|hr)\b[^>]*>/gi, '\n')
      .replace(/<\/(p|div|section|article|main|h[1-6]|li|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function extractTitle(html: string, fallbackUrl: string): string {
  const candidates = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  ]
  for (const re of candidates) {
    const m = html.match(re)
    if (m?.[1]) return stripHtmlToText(m[1]).slice(0, 180)
  }
  return sourceNameFromUrl(fallbackUrl)
}

function extractMetaContent(html: string, attrName: 'name' | 'property', attrValue: string): string | undefined {
  const escapedValue = attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `<meta\\b(?=[^>]*\\b${attrName}=["']${escapedValue}["'])(?=[^>]*\\bcontent=["']([^"']+)["'])[^>]*>`,
    'i',
  )
  const match = html.match(re)
  return match?.[1] ? stripHtmlToText(match[1]).slice(0, 120) : undefined
}

function extractAuthorName(html: string): string | undefined {
  const candidates = [
    extractMetaContent(html, 'name', 'author'),
    extractMetaContent(html, 'property', 'article:author'),
    extractMetaContent(html, 'name', 'twitter:creator'),
  ]
  return candidates.find((candidate) => candidate && candidate.trim())?.trim()
}

function extractBestContentHtml(html: string): string {
  const blocks: string[] = []
  for (const tag of ['article', 'main']) {
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
    for (const m of html.matchAll(re)) {
      if (m[1]) blocks.push(m[1])
    }
  }

  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]
  if (body) blocks.push(body)
  blocks.push(html)

  return blocks
    .map((block) => ({ block, length: stripHtmlToText(block).length }))
    .sort((a, b) => b.length - a.length)[0]?.block ?? html
}

function countWords(text: string): number {
  const latin = text.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0
  return latin + Math.ceil(cjk / 2)
}

function splitForTranslation(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ''
  for (const p of paragraphs) {
    if ((current + '\n\n' + p).length > TRANSLATE_CHUNK_CHARS && current) {
      chunks.push(current)
      current = p
    } else {
      current = current ? `${current}\n\n${p}` : p
    }
  }
  if (current) chunks.push(current)
  return chunks
}

async function fetchHtml(url: string): Promise<{ html: string; resolvedUrl: string } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': HTML_USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || ''
    if (!type.includes('text/html') && !type.includes('application/xhtml')) return null
    const html = await res.text()
    return { html, resolvedUrl: res.url || url }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchCandidateArticle(url: string): Promise<CandidateArticle | null> {
  const fetched = await fetchHtml(url)
  if (!fetched) return null
  const resolvedUrl = normalizeCandidateUrl(fetched.resolvedUrl) ?? fetched.resolvedUrl
  if (isExcludedLongformHost(resolvedUrl) || looksLikeStaticAsset(resolvedUrl)) return null

  const title = extractTitle(fetched.html, resolvedUrl)
  const text = stripHtmlToText(extractBestContentHtml(fetched.html))
  const minChars = envInt('LONGFORM_MIN_CHARS', DEFAULT_MIN_CHARS)
  if (text.length < minChars) return null

  return {
    requestedUrl: url,
    resolvedUrl,
    title,
    sourceName: sourceNameFromUrl(resolvedUrl),
    authorName: extractAuthorName(fetched.html),
    text,
    originalWordCount: countWords(text),
  }
}

async function translateLongformText(
  translate: (text: string) => Promise<string>,
  text: string,
): Promise<string> {
  const maxChars = envInt('LONGFORM_TRANSLATE_MAX_CHARS', DEFAULT_MAX_TRANSLATE_CHARS)
  const capped = text.slice(0, maxChars)
  const chunks = splitForTranslation(capped)
  const translated: string[] = []
  for (const chunk of chunks) {
    translated.push(await translate(chunk))
  }
  return translated.join('\n\n').trim()
}

export async function extractLongformForRawPost(
  input: ExtractLongformInput,
  translate: (text: string) => Promise<string>,
): Promise<LongformArticle | undefined> {
  if (!isEnabled()) return undefined

  const candidates = extractCandidateUrls(input)
  for (const candidate of candidates) {
    const article = await fetchCandidateArticle(candidate)
    if (!article) continue

    const [translatedTitle, translatedContent] = await Promise.all([
      translate(article.title).catch(() => article.title),
      translateLongformText(translate, article.text),
    ])

    return {
      url: article.requestedUrl,
      resolvedUrl: article.resolvedUrl,
      title: article.title,
      sourceName: article.sourceName,
      ...(article.authorName ? { authorName: article.authorName } : {}),
      excerpt: translatedContent.slice(0, 260),
      translatedTitle,
      translatedContent,
      originalWordCount: article.originalWordCount,
      fetchedAt: new Date().toISOString(),
    }
  }

  return undefined
}
