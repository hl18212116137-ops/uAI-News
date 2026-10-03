import type { NewsItem } from '../lib/types'

export function post(id: string, overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id, title: `测试资讯 ${id}`, summary: '', content: '', originalText: '',
    source: { platform: 'Blog', name: '测试源', handle: 'Example', url: `https://example.com/${id}` },
    category: '研究', publishedAt: '2026-10-01T00:00:00Z', createdAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

export function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}
