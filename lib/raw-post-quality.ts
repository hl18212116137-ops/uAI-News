import 'server-only'

import { mediaUrlsFromDbJson, referencedPostFromDbJson } from '@/lib/db/news'

function envInt(name: string, fallback: number): number {
  const raw = parseInt(process.env[name] || String(fallback), 10)
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback
}

export type LowSignalThresholds = {
  minOuter: number
  minNestedRt: number
}

export function getLowSignalRawPostPassReason(
  rawPost: Record<string, unknown>,
  thresholds?: LowSignalThresholds
): string | null {
  const minOuter = thresholds?.minOuter ?? envInt('RAW_MIN_OUTER_CHARS', 12)
  const minNestedRt = thresholds?.minNestedRt ?? envInt('RAW_MIN_NESTED_CHARS_RETWEET', 35)

  const outer = String(rawPost.text ?? '').trim()
  const urls = mediaUrlsFromDbJson(rawPost.media_urls)
  const hasMedia = (urls?.length ?? 0) > 0

  if (outer.length < minOuter && !hasMedia) {
    return `外层文字只有 ${outer.length} 字，少于 ${minOuter} 字，且没有图片或视频。`
  }

  const ref = referencedPostFromDbJson(rawPost.referenced_post)
  if (ref && ref.text.trim().length < minNestedRt && !hasMedia) {
    return `引用/转发原帖只有 ${ref.text.trim().length} 字，少于 ${minNestedRt} 字，且没有图片或视频。`
  }

  return null
}
