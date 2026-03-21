"use client";

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    if (password.length < 6) {
      setError('密码至少需要 6 位字符')
      return
    }

    setIsLoading(true)
    const supabase = createSupabaseBrowserClient()
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (authError) {
      setError(authError.message === 'User already registered'
        ? '该邮箱已注册，请直接登录'
        : authError.message
      )
      setIsLoading(false)
      return
    }

    setSuccess(true)
    setIsLoading(false)
  }

  // 注册成功提示
  if (success) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-[400px] text-center">
          <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#101828] mb-2">注册成功！</h2>
          <p className="text-sm text-[#6a7282] mb-6">
            请查收 <strong>{email}</strong> 的确认邮件，点击邮件中的链接激活账号。
          </p>
          <Link
            href="/login"
            className="inline-block btn-primary btn-press rounded-full px-6 py-2.5 text-sm font-medium"
          >
            前往登录
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-[400px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block text-2xl font-semibold text-[#101828]">
            🤖 uAI 周报
          </Link>
          <p className="text-sm text-[#6a7282] mt-2">创建账号，开始你的 AI 资讯之旅</p>
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
              placeholder="至少 6 位字符"
              required
              autoComplete="new-password"
              className="input-field w-full text-sm"
            />
          </div>

          {/* 确认密码 */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#101828] mb-1">
              确认密码
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入密码"
              required
              autoComplete="new-password"
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
            {isLoading ? '注册中...' : '创建账号'}
          </button>
        </form>

        {/* 底部链接 */}
        <p className="text-center text-sm text-[#99a1af] mt-6">
          已有账号？{' '}
          <Link href="/login" className="text-[#101828] font-medium hover:underline">
            立即登录
          </Link>
        </p>
      </div>
    </div>
  )
}
