import { createBrowserClient } from '@supabase/ssr'

/**
 * Client Components 专用的 Supabase 客户端（浏览器端）
 * 使用 anon key，受 RLS 约束，自动管理 token 刷新
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
