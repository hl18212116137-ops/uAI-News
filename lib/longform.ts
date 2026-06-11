import 'server-only'

import type { LongformArticle, XReferencedPost } from '@/lib/types'

type ExtractLongformInput = {
  platform: string
  text: string
  sourceUrl: string
  authorName: string
  authorHandle: string
  mediaUrls?: string[]
  referencedPost?: XReferencedPost | null
}

type CandidateArticle = {
  requestedUrl: string
  resolvedUrl: string
  title: string
  sourceName: string
  authorName?: string
  text: string
  originalWordCount: number
  discoveryMethod: NonNullable<LongformArticle['discoveryMethod']>
  confidence?: number
  discoverySourceImageUrl?: string
}

type ScreenshotArticleClues = {
  imageUrl: string
  isArticleScreenshot: boolean
  title?: string
  authors: string[]
  venue?: string
  doi?: string
  arxivId?: string
  quotedText?: string
  confidence: number
}

type VisionConfig = {
  apiUrl: string
  apiKey: string
  model: string
}

const URL_RE = /https?:\/\/[^\s<>"'`)\]}]+/gi
const TRAILING_URL_PUNCTUATION_RE = /[),.;!?\u3001\u3002\uff0c\uff01\uff1f\uff09\uff3d]+$/g
const HTML_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 AI-News-Longform/1.0'
const DEFAULT_MIN_CHARS = 1800
const DEFAULT_IMAGE_MIN_CHARS = 1000
const DEFAULT_MAX_TRANSLATE_CHARS = 12000
const TRANSLATE_CHUNK_CHARS = 2800
const VISION_API_URL_DEFAULT = 'https://api.openai.com/v1/chat/completions'

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function envFloat(name: string, fallback: number): number {
  const n = Number.parseFloat(process.env[name] || '')
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  const normalized = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function isEnabled(): boolean {
  return envBool('LONGFORM_EXTRACTION_ENABLED', true)
}

function normalizeCandidateUrl(raw: string): string | null {
  try {
    const cleaned = raw.trim().replace(TRAILING_URL_PUNCTUATION_RE, '')
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
  if (!host) return '\u539f\u6587'
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
    return /\.(png|jpe?g|gif|webp|svg|mp4|mov|webm|zip|gz|tar|dmg|exe|pdf)$/i.test(path)
  } catch {
    return true
  }
}

function isImageMediaUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    const path = u.pathname.toLowerCase()
    if (host.includes('twimg.com') && path.includes('/media/')) return true
    if (/\.(png|jpe?g|webp|gif)$/i.test(path)) return true
    const format = u.searchParams.get('format')?.toLowerCase()
    return !!format && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(format)
  } catch {
    return false
  }
}

function collectTextBlocks(input: ExtractLongformInput): string[] {
  return [input.text, input.referencedPost?.text]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
}

function extractCandidateUrls(input: ExtractLongformInput): string[] {
  const out = new Set<string>()
  for (const text of collectTextBlocks(input)) {
    for (const match of text.matchAll(URL_RE)) {
      const url = normalizeCandidateUrl(match[0])
      if (url) out.add(url)
    }
  }

  if ((input.platform === 'RSS' || input.platform === 'Blog') && input.sourceUrl) {
    const url = normalizeCandidateUrl(input.sourceUrl)
    if (url) out.add(url)
  }

  return Array.from(out).filter((url) => !looksLikeStaticAsset(url))
}

function collectImageMediaUrls(input: ExtractLongformInput): string[] {
  const urls = new Set<string>()
  for (const raw of [...(input.mediaUrls ?? []), ...(input.referencedPost?.mediaUrls ?? [])]) {
    if (typeof raw === 'string' && isImageMediaUrl(raw)) urls.add(raw)
  }
  return Array.from(urls).slice(0, envInt('LONGFORM_IMAGE_MAX_IMAGES', 2))
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
    extractMetaContent(html, 'name', 'citation_author'),
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

async function fetchCandidateArticle(
  url: string,
  discoveryMethod: NonNullable<LongformArticle['discoveryMethod']>,
  meta: Pick<CandidateArticle, 'confidence' | 'discoverySourceImageUrl'> = {},
): Promise<CandidateArticle | null> {
  const fetched = await fetchHtml(url)
  if (!fetched) return null
  const resolvedUrl = normalizeCandidateUrl(fetched.resolvedUrl) ?? fetched.resolvedUrl
  if (isExcludedLongformHost(resolvedUrl) || looksLikeStaticAsset(resolvedUrl)) return null

  const title = extractTitle(fetched.html, resolvedUrl)
  const text = stripHtmlToText(extractBestContentHtml(fetched.html))
  const minChars =
    discoveryMethod === 'image-search'
      ? envInt('LONGFORM_IMAGE_MIN_CHARS', DEFAULT_IMAGE_MIN_CHARS)
      : envInt('LONGFORM_MIN_CHARS', DEFAULT_MIN_CHARS)
  if (text.length < minChars) return null

  return {
    requestedUrl: url,
    resolvedUrl,
    title,
    sourceName: sourceNameFromUrl(resolvedUrl),
    authorName: extractAuthorName(fetched.html),
    text,
    originalWordCount: countWords(text),
    discoveryMethod,
    ...meta,
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

async function articleToLongform(
  article: CandidateArticle,
  translate: (text: string) => Promise<string>,
): Promise<LongformArticle> {
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
    discoveryMethod: article.discoveryMethod,
    ...(article.confidence != null ? { confidence: Number(article.confidence.toFixed(3)) } : {}),
    ...(article.discoverySourceImageUrl ? { discoverySourceImageUrl: article.discoverySourceImageUrl } : {}),
  }
}

function getVisionConfig(): VisionConfig | null {
  if (!envBool('LONGFORM_IMAGE_DISCOVERY_ENABLED', true)) return null
  const apiKey = process.env.LONGFORM_VISION_API_KEY || ''
  const model = process.env.LONGFORM_VISION_MODEL || ''
  if (!apiKey || !model) return null
  return {
    apiUrl: process.env.LONGFORM_VISION_API_URL || VISION_API_URL_DEFAULT,
    apiKey,
    model,
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function asCleanString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, maxLength) : undefined
}

function normalizeDoi(value: unknown): string | undefined {
  const raw = asCleanString(value, 160)
  if (!raw) return undefined
  const cleaned = raw
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim()
    .replace(TRAILING_URL_PUNCTUATION_RE, '')
  return /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(cleaned) ? cleaned : undefined
}

function normalizeArxivId(value: unknown): string | undefined {
  const raw = asCleanString(value, 80)
  if (!raw) return undefined
  const cleaned = raw
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//i, '')
    .replace(/^arxiv:\s*/i, '')
    .replace(/\.pdf$/i, '')
    .trim()
  const match = cleaned.match(/^(?:[a-z-]+\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?$/i)
  return match ? match[0] : undefined
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  const direct = tryParseJsonObject(trimmed)
  if (direct) return direct
  const match = trimmed.match(/\{[\s\S]*\}/)
  return match ? tryParseJsonObject(match[0]) : null
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

async function extractScreenshotClues(
  imageUrl: string,
  input: ExtractLongformInput,
): Promise<ScreenshotArticleClues | null> {
  const config = getVisionConfig()
  if (!config) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), envInt('LONGFORM_VISION_TIMEOUT_MS', 20000))
  try {
    const res = await fetch(config.apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Extract bibliographic clues from a screenshot. Return only JSON with keys: isArticleScreenshot, title, authors, venue, doi, arxivId, quotedText, confidence. Use null for unknown fields.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  `Tweet author: ${input.authorName} (${input.authorHandle})\n` +
                  `Tweet text:\n${collectTextBlocks(input).join('\n\n---\n').slice(0, 1600)}\n\n` +
                  'Decide whether the image is a screenshot of a paper, article, blog post, or media longform page.',
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null
    const parsed = parseJsonObject(content)
    if (!parsed) return null

    const authorsRaw = parsed.authors
    const authors = Array.isArray(authorsRaw)
      ? authorsRaw.map((x) => asCleanString(x, 80)).filter((x): x is string => !!x)
      : []
    const confidence = clamp01(
      typeof parsed.confidence === 'number' ? parsed.confidence : Number.parseFloat(String(parsed.confidence ?? '0')),
    )
    const clues: ScreenshotArticleClues = {
      imageUrl,
      isArticleScreenshot: parsed.isArticleScreenshot === true,
      title: asCleanString(parsed.title, 220),
      authors,
      venue: asCleanString(parsed.venue, 120),
      doi: normalizeDoi(parsed.doi),
      arxivId: normalizeArxivId(parsed.arxivId),
      quotedText: asCleanString(parsed.quotedText, 500),
      confidence,
    }
    const minConfidence = envFloat('LONGFORM_IMAGE_CLUE_MIN_CONFIDENCE', 0.55)
    if (!clues.isArticleScreenshot || clues.confidence < minConfidence) return null
    if (!clues.title && !clues.doi && !clues.arxivId && !clues.quotedText) return null
    return clues
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function buildSearchQueries(clues: ScreenshotArticleClues): string[] {
  const queries = new Set<string>()
  const title = clues.title?.trim()
  const author = clues.authors[0]?.trim()
  if (title && author) queries.add(`"${title}" "${author}"`)
  if (title) queries.add(`"${title}"`)
  if (title && clues.venue) queries.add(`"${title}" "${clues.venue}"`)
  if (clues.quotedText) queries.add(`"${clues.quotedText.slice(0, 160)}"`)
  return Array.from(queries).slice(0, envInt('LONGFORM_IMAGE_MAX_SEARCH_QUERIES', 3))
}

function decodeDuckDuckGoResultUrl(rawHref: string): string | null {
  const decodedHref = decodeEntities(rawHref)
  const absolute = decodedHref.startsWith('//') ? `https:${decodedHref}` : decodedHref
  try {
    const u = new URL(absolute)
    const uddg = u.searchParams.get('uddg')
    if (uddg) return normalizeCandidateUrl(uddg)
    return normalizeCandidateUrl(u.href)
  } catch {
    return null
  }
}

async function fetchSearchCandidates(query: string): Promise<string[]> {
  if (!envBool('LONGFORM_IMAGE_WEB_SEARCH_ENABLED', true)) return []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), envInt('LONGFORM_SEARCH_TIMEOUT_MS', 8000))
  try {
    const res = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: {
        'user-agent': HTML_USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) return []
    const html = await res.text()
    const urls = new Set<string>()
    const re = /<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi
    for (const match of html.matchAll(re)) {
      const url = decodeDuckDuckGoResultUrl(match[1])
      if (url && !looksLikeStaticAsset(url) && !isExcludedLongformHost(url)) urls.add(url)
      if (urls.size >= envInt('LONGFORM_IMAGE_SEARCH_MAX_RESULTS', 5)) break
    }
    return Array.from(urls)
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

async function candidateUrlsFromClues(clues: ScreenshotArticleClues): Promise<string[]> {
  const urls = new Set<string>()
  if (clues.doi) urls.add(`https://doi.org/${clues.doi}`)
  if (clues.arxivId) {
    urls.add(`https://ar5iv.labs.arxiv.org/html/${clues.arxivId}`)
    urls.add(`https://arxiv.org/html/${clues.arxivId}`)
    urls.add(`https://arxiv.org/abs/${clues.arxivId}`)
  }
  for (const query of buildSearchQueries(clues)) {
    for (const url of await fetchSearchCandidates(query)) urls.add(url)
  }
  return Array.from(urls).slice(0, envInt('LONGFORM_IMAGE_MAX_CANDIDATES', 8))
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokensForMatch(text: string): Set<string> {
  const normalized = normalizeForMatch(text)
  const tokens = normalized.match(/[a-z0-9]{3,}|[\u4e00-\u9fff]/g) ?? []
  return new Set(tokens)
}

function diceSimilarity(a: string, b: string): number {
  const na = normalizeForMatch(a)
  const nb = normalizeForMatch(b)
  if (!na || !nb) return 0
  if (na.includes(nb) || nb.includes(na)) return 1
  const ta = tokensForMatch(na)
  const tb = tokensForMatch(nb)
  if (ta.size === 0 || tb.size === 0) return 0
  let overlap = 0
  for (const token of ta) {
    if (tb.has(token)) overlap++
  }
  return (2 * overlap) / (ta.size + tb.size)
}

function authorMatchScore(articleAuthor: string | undefined, clueAuthors: string[]): number {
  if (!articleAuthor || clueAuthors.length === 0) return 0
  const article = normalizeForMatch(articleAuthor)
  let best = 0
  for (const author of clueAuthors) {
    const candidate = normalizeForMatch(author)
    if (!candidate) continue
    if (article.includes(candidate) || candidate.includes(article)) {
      best = Math.max(best, 1)
      continue
    }
    const last = candidate.split(' ').filter(Boolean).at(-1)
    if (last && article.includes(last)) best = Math.max(best, 0.65)
  }
  return best
}

function quoteMatchScore(articleText: string, quote: string | undefined): number {
  if (!quote) return 0
  const q = normalizeForMatch(quote)
  if (q.length < 24) return 0
  const body = normalizeForMatch(articleText)
  if (body.includes(q.slice(0, Math.min(q.length, 180)))) return 1
  return diceSimilarity(body.slice(0, 6000), q)
}

function identifierMatchScore(article: CandidateArticle, clues: ScreenshotArticleClues): number {
  const haystack = `${article.requestedUrl} ${article.resolvedUrl} ${article.text.slice(0, 1000)}`.toLowerCase()
  if (clues.doi && haystack.includes(clues.doi.toLowerCase())) return 1
  if (clues.arxivId && haystack.includes(clues.arxivId.toLowerCase().replace(/v\d+$/, ''))) return 1
  return 0
}

function scoreCandidateArticleMatch(article: CandidateArticle, clues: ScreenshotArticleClues): number {
  const titleScore = clues.title ? diceSimilarity(article.title, clues.title) : 0
  const authorScore = authorMatchScore(article.authorName, clues.authors)
  const quoteScore = quoteMatchScore(article.text, clues.quotedText)
  const idScore = identifierMatchScore(article, clues)
  const weighted =
    titleScore * 0.74 +
    authorScore * 0.08 +
    quoteScore * 0.14 +
    idScore * 0.24
  let base = clamp01(weighted)
  if (idScore >= 1 && (!clues.title || titleScore >= 0.35)) base = Math.max(base, 0.86)
  if (titleScore >= 0.92) base = Math.max(base, 0.78)
  if (quoteScore >= 0.9 && titleScore >= 0.45) base = Math.max(base, 0.78)
  const score = base * 0.9 + clues.confidence * 0.1
  return clamp01(score)
}

async function extractLongformFromUrlCandidates(
  urls: string[],
  translate: (text: string) => Promise<string>,
): Promise<LongformArticle | undefined> {
  for (const candidate of urls) {
    const article = await fetchCandidateArticle(candidate, 'url')
    if (!article) continue
    return articleToLongform(article, translate)
  }
  return undefined
}

async function extractLongformFromImages(
  input: ExtractLongformInput,
  translate: (text: string) => Promise<string>,
): Promise<LongformArticle | undefined> {
  const imageUrls = collectImageMediaUrls(input)
  if (imageUrls.length === 0) return undefined

  const minScore = envFloat('LONGFORM_IMAGE_MATCH_MIN_SCORE', 0.72)
  let best: { article: CandidateArticle; score: number } | null = null

  for (const imageUrl of imageUrls) {
    const clues = await extractScreenshotClues(imageUrl, input)
    if (!clues) continue

    const candidateUrls = await candidateUrlsFromClues(clues)
    for (const url of candidateUrls) {
      const article = await fetchCandidateArticle(url, 'image-search', {
        confidence: clues.confidence,
        discoverySourceImageUrl: imageUrl,
      })
      if (!article) continue
      const score = scoreCandidateArticleMatch(article, clues)
      if (score >= minScore && (!best || score > best.score)) {
        best = {
          article: {
            ...article,
            confidence: score,
          },
          score,
        }
      }
    }
  }

  return best ? articleToLongform(best.article, translate) : undefined
}

export async function extractLongformForRawPost(
  input: ExtractLongformInput,
  translate: (text: string) => Promise<string>,
): Promise<LongformArticle | undefined> {
  if (!isEnabled()) return undefined

  const direct = await extractLongformFromUrlCandidates(extractCandidateUrls(input), translate)
  if (direct) return direct

  return extractLongformFromImages(input, translate)
}
