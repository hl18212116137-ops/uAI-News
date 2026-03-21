import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * GET /api/bookmarks
 * 获取当前用户所有收藏的 news_item_id 列表
 */
export async function GET() {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('user_bookmarks')
      .select('news_item_id')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ success: true, bookmarkedIds: (data || []).map((r: any) => r.news_item_id) })
  } catch (error: any) {
    console.error('Failed to get bookmarks:', error)
    return NextResponse.json({ success: false, error: error.message || '获取收藏失败' }, { status: 500 })
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
    const body = await request.json()
    const { news_item_id } = body

    if (!news_item_id || typeof news_item_id !== 'string') {
      return NextResponse.json({ success: false, error: '请提供有效的 news_item_id' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    const { error } = await supabase
      .from('user_bookmarks')
      .insert({ user_id: user!.id, news_item_id })

    if (error && error.code !== '23505') throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Failed to add bookmark:', error)
    return NextResponse.json({ success: false, error: error.message || '收藏失败' }, { status: 500 })
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

    const supabase = createSupabaseServerClient()
    const { error } = await supabase
      .from('user_bookmarks')
      .delete()
      .eq('user_id', user!.id)
      .eq('news_item_id', newsItemId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Failed to remove bookmark:', error)
    return NextResponse.json({ success: false, error: error.message || '取消收藏失败' }, { status: 500 })
  }
}
