import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server Components / API Routes / Server Actions 专用的 Supabase 客户端
 * 使用 anon key + cookie session，受 RLS 约束
 * 注意：不要用于后台抓取/AI处理（那些用 lib/supabase.ts 的 service_role key）
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component 中无法设置 cookie，忽略错误
            // middleware 负责刷新 session
          }
        },
      },
    }
  )
}
