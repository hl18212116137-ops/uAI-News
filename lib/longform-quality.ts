import type { LongformArticle } from '@/lib/types'

function isCnbcVideoPageUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    return host.endsWith('cnbc.com') && url.pathname.toLowerCase().startsWith('/video/')
  } catch {
    return false
  }
}

export function isVideoTranscriptRequiredLongformUrl(rawUrl: string): boolean {
  return isCnbcVideoPageUrl(rawUrl)
}

export function isUsableLongformArticle(article: LongformArticle): boolean {
  if (!article.translatedContent.trim()) return false
  if (article.discoveryMethod === 'video-transcript') return true

  const url = article.resolvedUrl || article.url
  if (isVideoTranscriptRequiredLongformUrl(url)) return false

  return true
}
