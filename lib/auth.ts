import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

type AuthSuccess = { user: User; errorResponse: null }
type AuthFailure = { user: null; errorResponse: Response }

/**
 * API Route 鉴权工具函数
 * 在需要登录的 API handler 开头调用，未登录时返回 401
 *
 * 用法：
 *   const { user, errorResponse } = await requireAuth()
 *   if (errorResponse) return errorResponse
 *   // 继续业务逻辑，user 已确认存在
 */
export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      user: null,
      errorResponse: Response.json(
        { error: '请先登录后再执行此操作' },
        { status: 401 }
      ),
    }
  }

  return { user, errorResponse: null }
}
