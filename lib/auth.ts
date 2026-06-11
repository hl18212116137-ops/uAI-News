import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'

export interface AuthUser {
  id: string
  email: string
  name?: string | null
}

type AuthSuccess = { user: AuthUser; errorResponse: null }
type AuthFailure = { user: null; errorResponse: Response }

/**
 * API Route 鉴权工具函数
 * 在需要登录的 API handler 开头调用，未登录时返回 401
 */
export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return {
      user: null,
      errorResponse: Response.json(
        { error: '请先登录后再执行此操作' },
        { status: 401 }
      ),
    }
  }

  const user: AuthUser = {
    id: (session.user as any).id,
    email: session.user.email!,
    name: session.user.name,
  }

  return { user, errorResponse: null }
}

/**
 * 在 Server Component 中获取当前用户（不抛 401，返回 null 表示未登录）
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  return {
    id: (session.user as any).id,
    email: session.user.email!,
    name: session.user.name,
  }
}
