/**
 * 侧栏与信息流共用：优先 DB avatar；X 源无图时用公开头像解析（不依赖库内字段）。
 */

const X_PLATFORMS = new Set(['x', 'twitter'])

export function normalizeSourceHandle(handle: string | null | undefined): string {
  return String(handle ?? '').trim().replace(/^@+/, '').toLowerCase()
}

/** X 源默认头像（外链 CDN；DB 无图时展示与入库均可用） */
export function defaultAvatarUrlForHandle(handle: string): string {
  const h = normalizeSourceHandle(handle)
  if (!h) return ''
  return `https://unavatar.io/twitter/${encodeURIComponent(h)}`
}

export function resolveSourceAvatarUrl(
  handle: string | undefined | null,
  dbAvatar: string | undefined | null,
  platform: string | undefined | null
): string {
  const url = dbAvatar?.trim()
  if (url) return url

  const h = handle?.replace(/^@+/, '').trim()
  if (!h) return ''

  const p = (platform ?? '').toLowerCase()
  const allowUnavatar = p === '' || X_PLATFORMS.has(p)

  if (!allowUnavatar) return ''

  return defaultAvatarUrlForHandle(h)
}

/** 扩大 .in('handle', …) 命中：常见大小写变体（PG 默认区分大小写） */
export function expandHandleQueryVariants(handles: string[]): string[] {
  const out = new Set<string>()
  for (const raw of handles) {
    const h = raw.trim()
    if (!h) continue
    const withoutAt = h.replace(/^@+/, '')
    for (const variant of [h, withoutAt]) {
      if (!variant) continue
      out.add(variant)
      out.add(variant.toLowerCase())
      out.add(variant.toUpperCase())
      out.add(variant.charAt(0).toUpperCase() + variant.slice(1).toLowerCase())
      out.add(`@${variant}`)
    }
  }
  return [...out]
}
