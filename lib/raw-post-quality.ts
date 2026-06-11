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

/**
 * 规则预筛：极短外层、或引用帖嵌套过短且无媒体 → 跳过 processNews，直接删 raw。
 * @param thresholds 若省略则从环境变量读取（与旧行为一致）。
 */
export function shouldSkipLowSignalRawPost(
  rawPost: Record<string, unknown>,
  thresholds?: LowSignalThresholds
): boolean {
  const minOuter = thresholds?.minOuter ?? envInt('RAW_MIN_OUTER_CHARS', 12)
  const minNestedRt = thresholds?.minNestedRt ?? envInt('RAW_MIN_NESTED_CHARS_RETWEET', 35)

  const outer = String(rawPost.text ?? '').trim()
  const urls = mediaUrlsFromDbJson(rawPost.media_urls)
  const hasMedia = (urls?.length ?? 0) > 0

  if (outer.length < minOuter && !hasMedia) {
    return true
  }

  const ref = referencedPostFromDbJson(rawPost.referenced_post)
  if (ref && ref.text.trim().length < minNestedRt && !hasMedia) {
    return true
  }

  return false
}
