import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  listSources,
  addSourceFromUrlWithBackgroundFetch,
  deleteSourceByIdAndPosts,
  patchSourceById,
} from '@/lib/services/sources-service'

/**
 * GET /api/sources
 * 获取所有源列表
 */
export async function GET() {
  try {
    const sources = await listSources()
    return NextResponse.json({ success: true, sources })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取源列表失败'
    console.error('Failed to get sources:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/**
 * POST /api/sources
 * 添加新源（从URL提取博主信息）—— 允许未登录用户添加
 */
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  try {
    const body = await request.json()
    const { url } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ success: false, error: '请提供有效的URL' }, { status: 400 })
    }

    const { source, taskId, isLoggedIn, message } = await addSourceFromUrlWithBackgroundFetch({
      url,
      user: user ? { id: user.id } : null,
    })

    return NextResponse.json({
      success: true,
      message,
      source,
      taskId,
      isLoggedIn,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '添加源失败'
    console.error('Failed to add source:', error)
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}

/**
 * DELETE /api/sources?id=xxx
 * 删除源 —— 需要登录
 */
export async function DELETE(request: NextRequest) {
  const { errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: '请提供源ID' }, { status: 400 })
    }

    const { deletedPostsCount, message } = await deleteSourceByIdAndPosts(id)

    return NextResponse.json({
      success: true,
      message,
      deletedPostsCount,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '删除源失败'
    console.error('Failed to delete source:', error)
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}

/**
 * PATCH /api/sources
 * 更新源（如启用/禁用）—— 需要登录
 */
export async function PATCH(request: NextRequest) {
  const { errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const body = await request.json()
    const { id, updates } = body

    if (!id || !updates) {
      return NextResponse.json(
        { success: false, error: '请提供源ID和更新内容' },
        { status: 400 }
      )
    }

    await patchSourceById(id, updates)

    return NextResponse.json({
      success: true,
      message: '更新成功',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '更新源失败'
    console.error('Failed to update source:', error)
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
