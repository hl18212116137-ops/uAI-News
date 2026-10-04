import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  addBookmarkForUser,
  getBookmarkedIdsForUser,
  removeBookmarkForUser,
} from '@/lib/services/bookmarks-service'
import { revalidateHomeBookmarkCaches } from '@/lib/home-cache-invalidation'
import { z } from 'zod'

const bookmarkSchema = z.object({ news_item_id: z.string().trim().min(1).max(512) })

/**
 * GET /api/bookmarks
 * 获取当前用户所有收藏的 news_item_id 列表
 */
export async function GET() {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const bookmarkedIds = await getBookmarkedIdsForUser(user!.id)
    return NextResponse.json({ success: true, bookmarkedIds })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取收藏失败'
    console.error('Failed to get bookmarks:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/**
 * POST /api/bookmarks
 * 添加收藏 { news_item_id: string }
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const parsed = bookmarkSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: '请提供有效的 news_item_id' },
        { status: 400 }
      )
    }

    await addBookmarkForUser(user!.id, parsed.data.news_item_id)
    revalidateHomeBookmarkCaches()
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    // The article may have been pruned since its card was loaded.
    const cause = error instanceof Error && error.cause ? error.cause : error
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === '23503') {
      return NextResponse.json({ success: false, error: '这篇内容已不存在，请刷新后重试' }, { status: 404 })
    }
    console.error('Failed to add bookmark:', error)
    return NextResponse.json({ success: false, error: '收藏失败，请稍后重试' }, { status: 500 })
  }
}

/**
 * DELETE /api/bookmarks?id=news_item_id
 * 取消收藏
 */
export async function DELETE(request: NextRequest) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const { searchParams } = new URL(request.url)
    const newsItemId = searchParams.get('id')

    if (!newsItemId) {
      return NextResponse.json({ success: false, error: '请提供 news_item_id' }, { status: 400 })
    }

    await removeBookmarkForUser(user!.id, newsItemId)
    revalidateHomeBookmarkCaches()
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '取消收藏失败'
    console.error('Failed to remove bookmark:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
