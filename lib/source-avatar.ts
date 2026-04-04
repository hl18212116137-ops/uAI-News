/**
 * 侧栏与信息流共用：优先 DB avatar；X 源无图时用公开头像解析（不依赖库内字段）。
 */

const X_PLATFORMS = new Set(['x', 'twitter'])

export function resolveSourceAvatarUrl(
  handle: string | undefined | null,
  dbAvatar: string | undefined | null,
  platform: string | undefined | null
): string | undefined {
  const url = dbAvatar?.trim()
  if (url) return url

  const h = handle?.replace(/^@/, '').trim()
  if (!h) return undefined

  const p = (platform ?? '').toLowerCase()
  const allowUnavatar = p === '' || X_PLATFORMS.has(p)

  if (!allowUnavatar) return undefined

  return `https://unavatar.io/twitter/${encodeURIComponent(h)}`
}

/** 扩大 .in('handle', …) 命中：常见大小写变体（PG 默认区分大小写） */
export function expandHandleQueryVariants(handles: string[]): string[] {
  const out = new Set<string>()
  for (const raw of handles) {
    const h = raw.trim()
    if (!h) continue
    out.add(h)
    out.add(h.toLowerCase())
    out.add(h.toUpperCase())
    out.add(h.charAt(0).toUpperCase() + h.slice(1).toLowerCase())
  }
  return [...out]
}
