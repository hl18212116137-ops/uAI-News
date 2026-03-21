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
          <UserMenu user={user} />
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
