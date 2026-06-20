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
  contentKind: 'paper' | 'article'
  originalWordCount: number
  discoveryMethod: NonNullable<LongformArticle['discoveryMethod']>
  confidence?: number
  discoverySourceImageUrl?: string
}

type TextArticleInput = {
  requestedUrl: string
  resolvedUrl: string
  title: string
  sourceName: string
  authorName?: string
  text: string
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
const DEFAULT_MAX_TRANSLATE_CHARS = 36000
const TRANSLATE_CHUNK_CHARS = 2800
const VISION_API_URL_DEFAULT = 'https://api.openai.com/v1/chat/completions'
const TEXT_DISCOVERY_INDICATOR_RE =
  /\b(paper|papers|preprint|arxiv|article|essay|blog|report|study|studies)\b|论文|长文|文章|预印本|研究|报告/i

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

function arxivIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (!u.hostname.toLowerCase().endsWith('arxiv.org')) return null
    const match = u.pathname.match(/^\/(?:abs|pdf|html)\/([^/?#]+?)(?:\.pdf)?$/i)
    return match?.[1] ? normalizeArxivId(match[1]) ?? null : null
  } catch {
    return null
  }
}

function isArxivAbstractUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.hostname.toLowerCase() === 'arxiv.org' && /^\/abs\//i.test(u.pathname)
  } catch {
    return false
  }
}

function isScholarlyArticleUrl(url: string): boolean {
  const host = hostOf(url)
  if (!host) return false
  return (
    host === 'arxiv.org' ||
    host.endsWith('.arxiv.org') ||
    host === 'doi.org' ||
    host.endsWith('.doi.org') ||
    host === 'dl.acm.org' ||
    host.endsWith('.acm.org') ||
    host === 'openreview.net' ||
    host.endsWith('.openreview.net') ||
    host === 'biorxiv.org' ||
    host.endsWith('.biorxiv.org') ||
    host === 'medrxiv.org' ||
    host.endsWith('.medrxiv.org') ||
    host === 'nature.com' ||
    host.endsWith('.nature.com') ||
    host === 'science.org' ||
    host.endsWith('.science.org') ||
    host === 'proceedings.mlr.press' ||
    host.endsWith('.proceedings.mlr.press') ||
    host === 'neurips.cc' ||
    host.endsWith('.neurips.cc') ||
    host === 'openaccess.thecvf.com' ||
    host.endsWith('.openaccess.thecvf.com') ||
    host === 'aclanthology.org' ||
    host.endsWith('.aclanthology.org') ||
    host === 'semanticscholar.org' ||
    host.endsWith('.semanticscholar.org')
  )
}

function isLikelyScholarlyArticle(html: string, url: string): boolean {
  if (isScholarlyArticleUrl(url)) return true
  return (
    /\bltx_document\b/i.test(html) ||
    /name=["']citation_(?:title|author|journal_title|arxiv_id|doi)["']/i.test(html) ||
    /property=["'](?:og:type|article:section)["'][^>]+content=["']article["']/i.test(html)
  )
}

function expandCandidateUrlVariants(url: string): string[] {
  const normalized = normalizeCandidateUrl(url)
  if (!normalized) return []
  const arxivId = arxivIdFromUrl(normalized)
  if (!arxivId) return [normalized]
  return [
    `https://arxiv.org/html/${arxivId}`,
    `https://ar5iv.labs.arxiv.org/html/${arxivId}`,
    `https://arxiv.org/abs/${arxivId}`,
  ]
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
  const articleMatch = html.match(/<article\b(?=[^>]*\bltx_document\b)[^>]*>[\s\S]*?<\/article>/i)
  if (articleMatch?.[0]) {
    return articleMatch[0].replace(/<section\b(?=[^>]*\bltx_bibliography\b)[\s\S]*$/i, '')
  }

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

const ARTICLE_STOP_HEADING_RE =
  /^(references?|bibliography|citations?|acknowledg(e)?ments?|appendix|supplementary material|参考文献|参考资料|致谢|附录|补充材料)$/i

const ARTICLE_CHROME_RE =
  /(skip to main content|advanced search|quick links|login|help pages?|all fields|journal reference|ACM classification|MSC classification|report number|arXiv identifier|ORCID|author ID|view PDF|HTML \(experimental\)|donate|Simons Foundation|privacy policy|copyright|all rights reserved|跳至主内容|高级搜索|快速链接|登录|帮助页面|所有字段|期刊参考文献|ACM\s*分类|MSC\s*分类|报告编号|arXiv\s*标识符|作者\s*ID|查看\s*PDF|实验性|捐赠|隐私政策|版权所有)/i

const ARTICLE_METADATA_RE =
  /^(title|authors?|submitted|published|updated|doi|arxiv|keywords?|categories?|标题|作者|提交于|发布于|更新日期|关键词|分类)\s*[:：\[]/i

const PAPER_ABSTRACT_HEADING_RE =
  /^(abstract|summary|paper summary|author summary|synopsis|摘要|概要|概述)$/i

const PAPER_INTRO_HEADING_RE =
  /^(?:\d+(?:\.\d+)*\.?\s*)?(introduction|background|overview|motivation|引言|介绍|背景|概述)$/i

const PAPER_CONCLUSION_HEADING_RE =
  /^(?:\d+(?:\.\d+)*\.?\s*)?(conclusion|conclusions|discussion|concluding remarks|final remarks|summary and conclusions|limitations and future work|结论|总结|讨论|结语|局限与展望)$/i

const PAPER_STOP_SECTION_RE =
  /^(?:\d+(?:\.\d+)*\.?\s*)?(references?|bibliography|appendix|appendices|acknowledg(?:e)?ments?|supplementary(?: material| information)?|ethics statement|impact statement|参考文献|致谢|附录|补充材料)$/i

const PAPER_ANY_SECTION_HEADING_RE =
  /^(?:\d+(?:\.\d+)*\.?\s*)?[A-Z][A-Za-z0-9 ,:/()&-]{2,90}$|^(?:\d+(?:\.\d+)*\.?\s*)?[\u4e00-\u9fffA-Za-z0-9 ,:/()&-]{2,40}$/i

type PaperSectionKind = 'abstract' | 'intro' | 'conclusion'

type PaperSection = {
  kind: PaperSectionKind
  heading: string
  paragraphs: string[]
}

function cleanArticleParagraph(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\bdoi:\s*\S+/gi, '')
    .replace(/\[[0-9,\s-]+\]/g, '')
    .replace(/^(abstract|summary|摘要|概要)\s*[:：]\s*/i, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function articleParagraphKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fffA-Za-z0-9]+/g, '')
    .slice(0, 100)
}

function isLikelyArticleFrontMatter(text: string, title: string): boolean {
  const clean = cleanArticleParagraph(text)
  if (!clean) return true
  if (articleParagraphKey(clean) === articleParagraphKey(title)) return true
  if (/^(abstract|summary|摘要|概要)$/i.test(clean)) return true
  if (clean.length <= 260 && /(@|\.edu\b|\.com\b|\.org\b|\.net\b|university|institute|department|school|college|laboratory|lab\b|research school|oxford|cambridge|stanford|mit\b|email|address|postcode|zip code|UK\b|USA\b|Australia\b|Canada\b|China\b|ACT\b|Canberra\b|Cincinnati\b|大学|学院|研究所|实验室|系|中心|邮箱|地址|邮编)/i.test(clean)) return true
  if (clean.length <= 80 && /^&?\s*[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,4}$/.test(clean)) return true
  if (clean.length <= 60 && !/[.!?。！？；;，,]/.test(clean) && /[\u4e00-\u9fffA-Za-z]/.test(clean)) return true
  return false
}

function isArticleNoiseParagraph(text: string, title: string): boolean {
  const clean = cleanArticleParagraph(text)
  if (!clean) return true
  if (/^[-=_]{3,}$/.test(clean)) return true
  if (ARTICLE_METADATA_RE.test(clean)) return true
  if (ARTICLE_CHROME_RE.test(clean) && clean.length < 320) return true
  if (articleParagraphKey(clean) === articleParagraphKey(title)) return true
  return false
}

function cleanCandidateArticleParagraphs(text: string, title: string): string[] {
  const paragraphs = text.split(/\n+/).map(cleanArticleParagraph).filter(Boolean)
  const out: string[] = []
  const seen = new Set<string>()
  let inFrontMatter = true

  for (const paragraph of paragraphs) {
    const heading = paragraph.replace(/[:：]+$/g, '').trim()
    if (out.length > 0 && heading.length <= 48 && ARTICLE_STOP_HEADING_RE.test(heading)) break

    if (inFrontMatter) {
      if (isLikelyArticleFrontMatter(paragraph, title) || isArticleNoiseParagraph(paragraph, title)) {
        continue
      }
      inFrontMatter = false
    }

    if (isArticleNoiseParagraph(paragraph, title)) continue

    const key = articleParagraphKey(paragraph)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(paragraph)
  }

  return out.length > 0 ? out : paragraphs
}

function cleanCandidateArticleText(text: string, title: string): string {
  return cleanCandidateArticleParagraphs(text, title).join('\n\n').trim() || text.trim()
}

function normalizePaperHeading(text: string): string {
  return cleanArticleParagraph(text)
    .replace(/^[#\s]+/, '')
    .replace(/[.:：。]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isLikelyPaperSectionHeading(text: string): boolean {
  const heading = normalizePaperHeading(text)
  if (!heading || heading.length > 110) return false
  if (
    PAPER_ABSTRACT_HEADING_RE.test(heading) ||
    PAPER_INTRO_HEADING_RE.test(heading) ||
    PAPER_CONCLUSION_HEADING_RE.test(heading) ||
    PAPER_STOP_SECTION_RE.test(heading)
  ) {
    return true
  }
  if (/[.!?。！？]$/.test(heading)) return false
  return PAPER_ANY_SECTION_HEADING_RE.test(heading)
}

function paperSectionKindForHeading(text: string): PaperSectionKind | null {
  const heading = normalizePaperHeading(text)
  if (PAPER_ABSTRACT_HEADING_RE.test(heading)) return 'abstract'
  if (PAPER_INTRO_HEADING_RE.test(heading)) return 'intro'
  if (PAPER_CONCLUSION_HEADING_RE.test(heading)) return 'conclusion'
  return null
}

function collectLimitedSectionParagraphs(
  paragraphs: string[],
  maxParagraphs: number,
  maxChars: number,
): string[] {
  const out: string[] = []
  let length = 0
  for (const paragraph of paragraphs) {
    const clean = cleanArticleParagraph(paragraph)
    if (!clean || isLikelyPaperSectionHeading(clean)) continue
    if (out.length >= maxParagraphs || length + clean.length > maxChars) break
    out.push(clean)
    length += clean.length
  }
  return out
}

function sectionizePaperParagraphs(paragraphs: string[]): PaperSection[] {
  const sections: PaperSection[] = []
  let current: PaperSection | null = null

  for (const paragraph of paragraphs) {
    const heading = normalizePaperHeading(paragraph)
    if (heading && PAPER_STOP_SECTION_RE.test(heading)) break

    const kind = paperSectionKindForHeading(heading)
    if (kind) {
      current = { kind, heading, paragraphs: [] }
      sections.push(current)
      continue
    }

    if (isLikelyPaperSectionHeading(heading)) {
      current = null
      continue
    }

    if (current) current.paragraphs.push(paragraph)
  }

  return sections
}

function findPaperSection(sections: PaperSection[], kind: PaperSectionKind): PaperSection | null {
  return sections.find((section) => section.kind === kind && section.paragraphs.length > 0) ?? null
}

function uniquePaperParagraphs(paragraphs: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const paragraph of paragraphs) {
    const clean = cleanArticleParagraph(paragraph)
    const key = articleParagraphKey(clean)
    if (!clean || !key || seen.has(key)) continue
    seen.add(key)
    out.push(clean)
  }
  return out
}

function selectPaperReadingText(text: string, title: string): string {
  const paragraphs = cleanCandidateArticleParagraphs(text, title)
  if (paragraphs.length === 0) return text.trim()

  const sections = sectionizePaperParagraphs(paragraphs)
  const abstractSection = findPaperSection(sections, 'abstract')
  const introSection = findPaperSection(sections, 'intro')
  const conclusionSection = findPaperSection(sections, 'conclusion')

  const abstractParagraphs = abstractSection
    ? collectLimitedSectionParagraphs(abstractSection.paragraphs, 4, 4500)
    : collectLimitedSectionParagraphs(paragraphs.slice(0, 3), 2, 2600)

  let introParagraphs = introSection
    ? collectLimitedSectionParagraphs(introSection.paragraphs, 10, 9000)
    : []

  if (introParagraphs.length === 0) {
    const start = Math.max(abstractParagraphs.length, 1)
    introParagraphs = collectLimitedSectionParagraphs(paragraphs.slice(start, start + 10), 8, 7000)
  }

  let conclusionParagraphs = conclusionSection
    ? collectLimitedSectionParagraphs(conclusionSection.paragraphs, 8, 7000)
    : []

  if (conclusionParagraphs.length === 0 && paragraphs.length > 6) {
    conclusionParagraphs = collectLimitedSectionParagraphs(paragraphs.slice(-8), 5, 4200)
  }

  const parts: string[] = []
  const addSection = (heading: string, sectionParagraphs: string[]) => {
    const clean = uniquePaperParagraphs(sectionParagraphs)
    if (clean.length === 0) return
    parts.push(heading)
    parts.push(...clean)
  }

  addSection('Abstract', abstractParagraphs)
  addSection('Introduction', introParagraphs)
  addSection('Conclusion', conclusionParagraphs)

  const selected = parts.join('\n\n').trim()
  return selected || paragraphs.join('\n\n').trim() || text.trim()
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
  if (isArxivAbstractUrl(resolvedUrl)) return null

  const title = extractTitle(fetched.html, resolvedUrl)
  const contentKind = isLikelyScholarlyArticle(fetched.html, resolvedUrl) ? 'paper' : 'article'
  const cleanText = cleanCandidateArticleText(stripHtmlToText(extractBestContentHtml(fetched.html)), title)
  const text = contentKind === 'paper' ? selectPaperReadingText(cleanText, title) : cleanText
  const minChars =
    contentKind === 'paper'
      ? envInt('LONGFORM_PAPER_MIN_CHARS', 600)
      : discoveryMethod === 'image-search'
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
    contentKind,
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

export async function createLongformFromTextArticle(
  input: TextArticleInput,
  translate: (text: string) => Promise<string>,
): Promise<LongformArticle> {
  const text = input.text.trim()
  const title = input.title.trim() || input.sourceName || '手动添加长文'

  return articleToLongform(
    {
      requestedUrl: input.requestedUrl,
      resolvedUrl: input.resolvedUrl,
      title,
      sourceName: input.sourceName || sourceNameFromUrl(input.resolvedUrl) || '手动添加',
      ...(input.authorName ? { authorName: input.authorName } : {}),
      text,
      contentKind: 'article',
      originalWordCount: countWords(text),
      discoveryMethod: 'url',
    },
    translate,
  )
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

async function fetchArxivSearchCandidates(query: string): Promise<string[]> {
  if (!envBool('LONGFORM_ARXIV_SEARCH_ENABLED', true)) return []
  const trimmed = query.replace(/"/g, '').replace(/\s+/g, ' ').trim()
  if (!trimmed) return []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), envInt('LONGFORM_ARXIV_SEARCH_TIMEOUT_MS', 8000))
  try {
    const urls = new Set<string>()
    const phrases = [...query.matchAll(/"([^"]{8,160})"/g)]
      .map((match) => match[1].replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
    const exactPhrase = phrases[0]
    const apiQueries = exactPhrase
      ? [`ti:"${exactPhrase}"`, `all:"${exactPhrase}"`]
      : [`all:${trimmed}`]

    for (const apiQuery of apiQueries) {
      const searchParams = new URLSearchParams({
        search_query: apiQuery,
        start: '0',
        max_results: String(envInt('LONGFORM_ARXIV_SEARCH_MAX_RESULTS', 4)),
      })
      const res = await fetch(`https://export.arxiv.org/api/query?${searchParams}`, {
        signal: controller.signal,
        headers: {
          'user-agent': HTML_USER_AGENT,
          accept: 'application/atom+xml,application/xml,text/xml',
        },
      })
      if (!res.ok) continue
      const xml = await res.text()
      const re = /<entry\b[\s\S]*?<id>(https?:\/\/arxiv\.org\/abs\/[^<]+)<\/id>[\s\S]*?<\/entry>/gi
      for (const match of xml.matchAll(re)) {
        for (const variant of expandCandidateUrlVariants(match[1])) urls.add(variant)
      }
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
    for (const url of expandCandidateUrlVariants(`https://arxiv.org/abs/${clues.arxivId}`)) {
      urls.add(url)
    }
  }
  for (const query of buildSearchQueries(clues)) {
    for (const url of await fetchSearchCandidates(query)) {
      for (const variant of expandCandidateUrlVariants(url)) urls.add(variant)
    }
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

function hasTextDiscoverySignal(input: ExtractLongformInput): boolean {
  return TEXT_DISCOVERY_INDICATOR_RE.test(collectTextBlocks(input).join('\n'))
}

function uniqueList(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const cleaned = value.replace(/\s+/g, ' ').trim()
    const key = cleaned.toLowerCase()
    if (!cleaned || seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
  }
  return out
}

function extractTextSignalTerms(text: string): string[] {
  const terms: string[] = []
  const acronyms = text.match(/\b[A-Z][A-Z0-9-]{2,}\b/g) ?? []
  for (const acronym of acronyms) {
    if (['THE', 'AND', 'HTTP', 'HTTPS', 'WWW'].includes(acronym)) continue
    terms.push(acronym)
  }

  const lower = text.toLowerCase()
  const addIf = (needles: string[], hints: string[]) => {
    if (needles.some((needle) => lower.includes(needle.toLowerCase()))) terms.push(...hints)
  }
  addIf(['超级适应智能', '超强自适应智能', '自适应智能', 'SAI'], [
    'Superhuman Adaptable Intelligence',
    'adaptable intelligence',
    'SAI',
  ])
  addIf(['通用人工智能', 'AGI'], ['Artificial General Intelligence', 'AGI'])
  addIf(['世界模型', 'world model', 'world models'], ['world models'])
  addIf(['自监督', 'self-supervised', 'self supervised', 'SSL'], ['self supervised learning', 'SSL'])
  addIf(['专业化', 'specialization'], ['specialization'])

  const quoted = text.match(/[“"']([^“”"']{12,120})[”"']/g) ?? []
  for (const raw of quoted) {
    const cleaned = raw.replace(/^[“"']|[”"']$/g, '').trim()
    if (/[A-Za-z]/.test(cleaned)) terms.push(cleaned)
  }

  return uniqueList(terms).slice(0, envInt('LONGFORM_TEXT_MAX_TERMS', 8))
}

function authorSearchTerms(input: ExtractLongformInput): string[] {
  const candidates = [
    input.authorName,
    input.authorHandle.replace(/^@/, ''),
    input.referencedPost?.name,
    input.referencedPost?.userName,
  ].filter((x): x is string => typeof x === 'string' && x.trim().length > 0)

  const out: string[] = []
  for (const candidate of candidates) {
    out.push(candidate)
    const parts = candidate.split(/\s+/).filter(Boolean)
    const last = parts.at(-1)
    if (last && last.length >= 4) out.push(last)
  }
  return uniqueList(out)
}

function buildTextSearchQueries(input: ExtractLongformInput): string[] {
  if (!envBool('LONGFORM_TEXT_DISCOVERY_ENABLED', true)) return []
  if (!hasTextDiscoverySignal(input)) return []

  const text = collectTextBlocks(input).join('\n')
  const terms = extractTextSignalTerms(text)
  if (terms.length < 2) return []

  const authors = authorSearchTerms(input)
  const primaryAuthor = authors[0]
  const strongTerms = terms.filter((term) => term.length > 3).slice(0, 4)
  const queries: string[] = []

  if (primaryAuthor && strongTerms.length > 0) {
    queries.push(`"${primaryAuthor}" ${strongTerms.map((term) => `"${term}"`).join(' ')} paper`)
  }
  if (primaryAuthor) {
    queries.push(`"${primaryAuthor}" ${terms.slice(0, 5).join(' ')} arxiv`)
  }
  if (strongTerms.length > 0) {
    queries.push(`${strongTerms.map((term) => `"${term}"`).join(' ')} arxiv`)
  }

  return uniqueList(queries).slice(0, envInt('LONGFORM_TEXT_MAX_SEARCH_QUERIES', 4))
}

function normalizedIncludes(haystack: string, term: string): boolean {
  const normalizedTerm = normalizeForMatch(term)
  if (!normalizedTerm) return false
  return haystack.includes(normalizedTerm)
}

function scoreTextSearchCandidate(
  article: CandidateArticle,
  input: ExtractLongformInput,
  signalTerms: string[],
): number {
  const haystack = normalizeForMatch(
    `${article.requestedUrl} ${article.resolvedUrl} ${article.title} ${article.authorName ?? ''} ${article.text.slice(0, 6000)}`,
  )
  const authors = authorSearchTerms(input)
  const authorScore = authors.some((author) => normalizedIncludes(haystack, author)) ? 1 : 0
  const terms = uniqueList(signalTerms)
  const matchedTerms = terms.filter((term) => normalizedIncludes(haystack, term))
  const denominator = Math.min(Math.max(terms.length, 1), 5)
  const termScore = clamp01(matchedTerms.length / denominator)
  const sourceHost = hostOf(article.resolvedUrl)
  const sourceScore =
    sourceHost.includes('arxiv.org') ||
    sourceHost.includes('doi.org') ||
    sourceHost.includes('acm.org') ||
    sourceHost.includes('nature.com') ||
    sourceHost.includes('science.org')
      ? 1
      : isExcludedLongformHost(article.resolvedUrl)
        ? 0
        : 0.45
  const titleScore = terms.some((term) => term.length >= 12 && normalizedIncludes(normalizeForMatch(article.title), term))
    ? 1
    : 0

  if (termScore < 0.35) return 0
  if (authorScore === 0 && termScore < 0.75) return 0
  return clamp01(authorScore * 0.28 + termScore * 0.42 + sourceScore * 0.12 + titleScore * 0.18)
}

async function textSearchCandidateUrls(input: ExtractLongformInput): Promise<string[]> {
  const queries = buildTextSearchQueries(input)
  const urls = new Set<string>()
  for (const query of queries) {
    for (const url of await fetchArxivSearchCandidates(query)) urls.add(url)
    for (const url of await fetchSearchCandidates(query)) {
      for (const variant of expandCandidateUrlVariants(url)) urls.add(variant)
    }
  }
  return Array.from(urls).slice(0, envInt('LONGFORM_TEXT_MAX_CANDIDATES', 24))
}

async function extractLongformFromUrlCandidates(
  urls: string[],
  translate: (text: string) => Promise<string>,
): Promise<LongformArticle | undefined> {
  for (const candidate of urls) {
    for (const variant of expandCandidateUrlVariants(candidate)) {
      const article = await fetchCandidateArticle(variant, 'url')
      if (!article) continue
      return articleToLongform(article, translate)
    }
  }
  return undefined
}

export async function extractLongformFromDirectUrl(
  url: string,
  translate: (text: string) => Promise<string>,
): Promise<LongformArticle | undefined> {
  if (!isEnabled()) return undefined
  return extractLongformFromUrlCandidates([url], translate)
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

async function extractLongformFromTextSearch(
  input: ExtractLongformInput,
  translate: (text: string) => Promise<string>,
): Promise<LongformArticle | undefined> {
  const urls = await textSearchCandidateUrls(input)
  if (urls.length === 0) return undefined

  const signalTerms = extractTextSignalTerms(collectTextBlocks(input).join('\n'))
  const minScore = envFloat('LONGFORM_TEXT_MATCH_MIN_SCORE', 0.62)
  let best: { article: CandidateArticle; score: number } | null = null

  for (const url of urls) {
    const article = await fetchCandidateArticle(url, 'text-search', {
      confidence: 0.7,
    })
    if (!article) continue
    const score = scoreTextSearchCandidate(article, input, signalTerms)
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

  return best ? articleToLongform(best.article, translate) : undefined
}

export async function extractLongformForRawPost(
  input: ExtractLongformInput,
  translate: (text: string) => Promise<string>,
): Promise<LongformArticle | undefined> {
  if (!isEnabled()) return undefined

  const direct = await extractLongformFromUrlCandidates(extractCandidateUrls(input), translate)
  if (direct) return direct

  const image = await extractLongformFromImages(input, translate)
  if (image) return image

  return extractLongformFromTextSearch(input, translate)
}
