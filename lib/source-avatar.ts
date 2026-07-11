/**
 * 侧栏与信息流共用：优先真实头像；无图时展示本地生成头像。
 */

const X_PLATFORMS = new Set(['x', 'twitter'])

const GENERATED_AVATAR_PALETTE = [
  { bg: '#fff1f2', fg: '#be123c', accent: '#fb2c36' },
  { bg: '#ffe4e6', fg: '#e11d28', accent: '#be123c' },
  { bg: '#f5f5f5', fg: '#101828', accent: '#d7a220' },
  { bg: '#ffffff', fg: '#101828', accent: '#f0c030' },
  { bg: '#f3f4f6', fg: '#6a7282', accent: '#99a1af' },
]

function isUnavatarUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === 'unavatar.io'
  } catch {
    return false
  }
}

function isTwitterDefaultAvatarUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.hostname.toLowerCase() === 'abs.twimg.com' &&
      parsed.pathname.includes('/sticky/default_profile_images/')
    )
  } catch {
    return false
  }
}

function isGeneratedSourceAvatarUrl(url: string): boolean {
  if (url.startsWith('/api/source-avatar/')) return true
  try {
    return new URL(url, 'http://local.uai').pathname.startsWith('/api/source-avatar/')
  } catch {
    return false
  }
}

export function isFallbackSourceAvatarUrl(value: unknown): boolean {
  const url = typeof value === 'string' ? value.trim() : ''
  if (!url) return false
  if (url.startsWith('data:image/svg+xml')) return true
  if (isGeneratedSourceAvatarUrl(url)) return true
  return isUnavatarUrl(url) || isTwitterDefaultAvatarUrl(url)
}

export function persistableSourceAvatarUrl(value: unknown): string | null {
  const url = typeof value === 'string' ? value.trim() : ''
  if (!url || isFallbackSourceAvatarUrl(url)) return null
  return url
}

export function normalizeSourceHandle(handle: string | null | undefined): string {
  return String(handle ?? '').trim().replace(/^@+/, '').toLowerCase()
}

function hashText(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function initialForHandle(handle: string): string {
  const cleaned = handle.replace(/^@+/, '').replace(/^[^a-zA-Z0-9\u4e00-\u9fff]+/, '')
  return (cleaned.charAt(0) || '?').toUpperCase()
}

export function sourceAvatarSvgForHandle(handle: string): string {
  const h = normalizeSourceHandle(handle) || 'source'
  const initial = escapeSvgText(initialForHandle(h))
  const palette = GENERATED_AVATAR_PALETTE[hashText(h) % GENERATED_AVATAR_PALETTE.length]

  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="${escapeSvgText(h)} avatar"><rect width="96" height="96" rx="14" fill="${palette.bg}"/><path d="M72 0h24v96H0V72c13.6 8.1 28.9 12.1 45.8 12.1C66.9 84.1 82.3 75.3 92 57.8V0H72Z" fill="${palette.accent}" opacity="0.14"/><circle cx="22" cy="22" r="10" fill="${palette.accent}" opacity="0.18"/><text x="48" y="54" text-anchor="middle" dominant-baseline="middle" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="42" font-weight="700" fill="${palette.fg}">${initial}</text></svg>`
}

/** X 源默认头像（本地生成；仅用于展示，不应作为真实头像写入 DB） */
export function defaultAvatarUrlForHandle(handle: string): string {
  const h = normalizeSourceHandle(handle)
  if (!h) return ''
  return `/api/source-avatar/${encodeURIComponent(h)}`
}

export function resolveSourceAvatarUrl(
  handle: string | undefined | null,
  dbAvatar: string | undefined | null,
  platform: string | undefined | null
): string {
  const url = dbAvatar?.trim()
  if (url && !isFallbackSourceAvatarUrl(url)) return url

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
