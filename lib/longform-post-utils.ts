import type { NewsItem } from '@/lib/types'

const PREVIEW_MARKERS = ['uai-longform-preview', 'example.com/']

export function isLongformPreviewPost(
  post: Pick<NewsItem, 'id' | 'source' | 'longform'>,
): boolean {
  const values = [
    post.id,
    post.source?.url,
    post.longform?.url,
    post.longform?.resolvedUrl,
  ]

  return values.some((value) => {
    const normalized = typeof value === 'string' ? value.toLowerCase() : ''
    return PREVIEW_MARKERS.some((marker) => normalized.includes(marker))
  })
}
