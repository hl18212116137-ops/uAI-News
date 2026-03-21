import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)

  // 需要登录才能访问的路由（后续阶段新增页面时在此追加）
  const protectedPaths = ['/profile', '/bookmarks']
  const isProtected = protectedPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  )

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', request.nextUrl.pathname)
    return Response.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // 排除 Next.js 静态资源和 API 路由（API 路由自己做鉴权）
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
}
