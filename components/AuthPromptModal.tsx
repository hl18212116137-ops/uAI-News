"use client";

import { useRouter } from 'next/navigation'

type AuthPromptModalProps = {
  isOpen: boolean
  onClose: () => void
  message?: string
}

/**
 * 未登录用户执行受保护操作时弹出的登录提示弹窗
 */
export default function AuthPromptModal({
  isOpen,
  onClose,
  message = '登录后即可使用此功能',
}: AuthPromptModalProps) {
  const router = useRouter()

  if (!isOpen) return null

  const handleGoLogin = () => {
    onClose()
    router.push('/login')
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full mx-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 图标 */}
        <div className="w-12 h-12 rounded-full bg-[#f9fafb] flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-[#6a7282]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>

        {/* 文案 */}
        <h3 className="text-lg font-semibold text-[#101828] text-center mb-2">需要登录</h3>
        <p className="text-sm text-[#6a7282] text-center mb-6">{message}</p>

        {/* 按钮 */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-full border border-[#e5e7eb] text-sm text-[#6a7282] hover:bg-[#f9fafb] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleGoLogin}
            className="flex-1 py-2 rounded-full bg-[#101828] text-sm text-white font-medium hover:bg-[#1a1f2e] transition-colors"
          >
            去登录
          </button>
        </div>
      </div>
    </div>
  )
}
