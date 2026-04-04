import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

function appendServerTiming(res: NextResponse, name: string, durMs: number) {
  const part = `${name};dur=${durMs.toFixed(1)}`
  const prev = res.headers.get('Server-Timing')
  res.headers.set('Server-Timing', prev ? `${prev}, ${part}` : part)
}

export async function middleware(request: NextRequest) {
  const t0 = performance.now()
  const { supabaseResponse, user } = await updateSession(request)
  const authMs = performance.now() - t0
  appendServerTiming(supabaseResponse, 'supabase_auth', authMs)

  // 需要登录才能访问的路由（后续阶段新增页面时在此追加）
  const protectedPaths = ['/profile', '/bookmarks']
  const isProtected = protectedPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  )

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', request.nextUrl.pathname)
    const redirect = NextResponse.redirect(loginUrl)
    appendServerTiming(redirect, 'supabase_auth', authMs)
    return redirect
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // 排除 Next.js 静态资源和 API 路由（API 路由自己做鉴权）
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
}
