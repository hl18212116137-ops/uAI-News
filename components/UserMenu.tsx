"use client";

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type UserMenuProps = {
  user: User
}

/**
 * 用户头像下拉菜单（Client Component）
 * 显示用户昵称/邮箱 + 退出登录选项
 */
export default function UserMenu({ user }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // 点击外部关闭菜单
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const displayName =
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    '用户'

  const avatarUrl = user.user_metadata?.avatar_url

  const handleSignOut = async () => {
    setIsLoggingOut(true)
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    setIsOpen(false)
    router.refresh()
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* 头像按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full hover:bg-gray-50 p-1 transition-colors"
        aria-label="用户菜单"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-[#101828] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-semibold">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <span className="text-sm text-[#101828] font-medium hidden sm:block max-w-[120px] truncate">
          {displayName}
        </span>
        <svg className="w-4 h-4 text-[#6a7282] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-[#e5e7eb] shadow-md py-1 animate-fade-in">
          {/* 用户信息 */}
          <div className="px-4 py-2 border-b border-[#f3f4f6]">
            <div className="text-sm font-medium text-[#101828] truncate">{displayName}</div>
            <div className="text-xs text-[#99a1af] truncate">{user.email}</div>
          </div>

          {/* 操作项 */}
          <button
            onClick={handleSignOut}
            disabled={isLoggingOut}
            className="w-full text-left px-4 py-2 text-sm text-[#6a7282] hover:bg-[#f9fafb] hover:text-[#101828] transition-colors disabled:opacity-50"
          >
            {isLoggingOut ? '退出中...' : '退出登录'}
          </button>
        </div>
      )}
    </div>
  )
}
