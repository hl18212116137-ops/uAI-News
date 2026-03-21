"use client";

import { useState, FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') ?? '/'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    const supabase = createSupabaseBrowserClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (authError) {
      setError(authError.message === 'Invalid login credentials'
        ? '邮箱或密码错误，请重试'
        : authError.message
      )
      setIsLoading(false)
      return
    }

    router.push(redirectTo)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-[400px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block text-2xl font-semibold text-[#101828]">
            🤖 uAI 周报
          </Link>
          <p className="text-sm text-[#6a7282] mt-2">登录以使用完整功能</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* 邮箱 */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#101828] mb-1">
              邮箱
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoComplete="email"
              className="input-field w-full text-sm"
            />
          </div>

          {/* 密码 */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#101828] mb-1">
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="input-field w-full text-sm"
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <p className="text-sm text-primary-500 bg-primary-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary btn-press w-full py-2.5 rounded-full text-sm font-medium mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>

        {/* 底部链接 */}
        <p className="text-center text-sm text-[#99a1af] mt-6">
          没有账号？{' '}
          <Link href="/register" className="text-[#101828] font-medium hover:underline">
            立即注册
          </Link>
        </p>
      </div>
    </div>
  )
}
