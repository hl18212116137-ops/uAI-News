import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { recordUserPassedPost } from '@/lib/db/pass-logs'
import { revalidateHomeFeedCaches } from '@/lib/home-cache-invalidation'
import type { NewsCategory, NewsItem, NewsSource, SocialEngagement, XReferencedPost } from '@/lib/types'

const VALID_CATEGORIES = new Set<NewsCategory>(['模型', '产品', '研究', '行业', '政策'])
const VALID_PLATFORMS = new Set<NewsSource['platform']>(['X', 'RSS', 'Blog', 'YouTube', 'Reddit'])

function stringValue(value: unknown, maxLength = 5000): string {
  const text = String(value ?? '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value
    .map((item) => stringValue(item, 1000))
    .filter(Boolean)
    .slice(0, 12)
  return out.length > 0 ? out : undefined
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function parseSource(value: unknown): NewsSource | null {
  const source = recordValue(value)
  if (!source) return null
  const platform = stringValue(source.platform, 40)
  return {
    platform: VALID_PLATFORMS.has(platform as NewsSource['platform'])
      ? (platform as NewsSource['platform'])
      : 'X',
    name: stringValue(source.name, 180),
    handle: stringValue(source.handle, 180),
    url: stringValue(source.url, 1000),
  }
}

function parseReferencedPost(value: unknown): XReferencedPost | undefined {
  const row = recordValue(value)
  if (!row) return undefined
  const kind = row.kind === 'retweet' || row.kind === 'quote' ? row.kind : 'quote'
  const text = stringValue(row.text, 5000)
  if (!text) return undefined

  return {
    kind,
    id: stringValue(row.id, 220) || undefined,
    text,
    userName: stringValue(row.userName, 180) || undefined,
    name: stringValue(row.name, 180) || undefined,
    mediaUrls: stringArrayValue(row.mediaUrls),
  }
}

function parseSocialEngagement(value: unknown): SocialEngagement | undefined {
  const row = recordValue(value)
  if (!row) return undefined
  const out: SocialEngagement = {}
  const keys: Array<keyof SocialEngagement> = [
    'replyCount',
    'retweetCount',
    'likeCount',
    'quoteCount',
    'bookmarkCount',
    'impressionCount',
  ]
  for (const key of keys) {
    const n = Number(row[key])
    if (Number.isFinite(n)) out[key] = n
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function parsePost(value: unknown): NewsItem | null {
  const row = recordValue(value)
  if (!row) return null

  const id = stringValue(row.id, 220)
  const source = parseSource(row.source)
  if (!id || !source) return null

  const category = stringValue(row.category, 80) as NewsCategory
  const now = new Date().toISOString()

  return {
    id,
    title: stringValue(row.title, 240),
    summary: stringValue(row.summary, 600),
    content: stringValue(row.content, 8000),
    source,
    category: VALID_CATEGORIES.has(category) ? category : '行业',
    publishedAt: stringValue(row.publishedAt, 80) || now,
    originalText: stringValue(row.originalText, 8000),
    createdAt: stringValue(row.createdAt, 80) || now,
    importanceScore: typeof row.importanceScore === 'number' ? row.importanceScore : undefined,
    mediaUrls: stringArrayValue(row.mediaUrls),
    socialEngagement: parseSocialEngagement(row.socialEngagement),
    referencedPost: parseReferencedPost(row.referencedPost),
  }
}

export async function POST(request: Request) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const body = (await request.json().catch(() => ({}))) as { post?: unknown }
    const post = parsePost(body.post)

    if (!post) {
      return NextResponse.json({ success: false, error: '缺少可 PASS 的推文数据' }, { status: 400 })
    }

    await recordUserPassedPost(user.id, post)
    revalidateHomeFeedCaches()
    return NextResponse.json({ success: true, message: '已 PASS，后续会少推荐类似内容' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'PASS 推文失败'
    console.error('POST /api/me/pass-post:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
