import type { User } from '@supabase/supabase-js'
import UserMenu from './UserMenu'
import Link from 'next/link'

type TopBarProps = {
  user: User | null
}

/**
 * 顶部固定导航栏
 * 高度 70px，填入 SiteHeader 内 mt-[70px] 预留的空间
 * Server Component，user 从 layout.tsx 传入
 */
export default function TopBar({ user }: TopBarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-[70px] z-50 bg-white border-b border-[#e5e7eb] flex items-center justify-between px-6">
      {/* 左侧：Logo */}
      <Link href="/" className="flex items-center gap-2 text-[#101828] font-semibold text-lg hover:opacity-80 transition-opacity">
        <span>🤖</span>
        <span>uAI 周报</span>
      </Link>

      {/* 右侧：登录状态 */}
      <div className="flex items-center gap-3">
        {user ? (
          <>
            <Link
              href="/bookmarks"
              className="flex items-center gap-1.5 text-sm text-[#6a7282] hover:text-[#101828] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              </svg>
              收藏
            </Link>
            <UserMenu user={user} />
          </>
        ) : (
          <Link
            href="/login"
            className="btn-primary btn-press rounded-full px-5 py-2 text-sm font-medium"
          >
            登录
          </Link>
        )}
      </div>
    </header>
  )
}
