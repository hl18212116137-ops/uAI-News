/** Accept only a local absolute path, including after browser URL normalization. */
export function safeRedirectPath(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(raw)) return '/'
  try {
    const base = 'https://local.invalid'
    const target = new URL(raw, base)
    return target.origin === base ? `${target.pathname}${target.search}${target.hash}` : '/'
  } catch {
    return '/'
  }
}
