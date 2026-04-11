"use client";

import { useState, FormEvent, useMemo } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { COMMON_WEBMAIL_QUICK, webmailForEmail } from "@/lib/webmail-entry";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 位。");
      return;
    }

    setIsLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) {
      setError(
        authError.message === "User already registered"
          ? "该邮箱已注册，请直接登录。"
          : authError.message
      );
      setIsLoading(false);
      return;
    }

    setSuccess(true);
    setIsLoading(false);
  };

  const shell = "flex min-h-dvh items-center justify-center bg-[#f5f5f5] px-4 py-10";

  const matchedWebmail = useMemo(() => webmailForEmail(email), [email]);
  const otherWebmailLinks = useMemo(() => {
    if (!matchedWebmail) return COMMON_WEBMAIL_QUICK;
    return COMMON_WEBMAIL_QUICK.filter((e) => e.url !== matchedWebmail.url);
  }, [matchedWebmail]);

  if (success) {
    return (
      <div className={shell}>
        <div
          className="modal-panel modal-panel-enter w-full max-w-[400px] p-6 text-center"
          role="region"
          aria-labelledby="register-success-title"
        >
          <div
            className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-md border border-[#e5e7eb] bg-[#fafafa]"
            aria-hidden
          >
            <svg
              className="h-5 w-5 text-[#101828]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1
            id="register-success-title"
            className="text-base font-semibold tracking-[-0.02em] text-[#101828]"
          >
            查收验证邮件
          </h1>
          <p className="mt-2 text-sm font-normal leading-5 text-[#6a7282]">
            我们已向{" "}
            <span className="font-medium text-[#101828]">{email}</span>{" "}
            发送确认邮件，请打开邮箱并<strong className="font-medium text-[#101828]">
              点击邮件中的验证链接
            </strong>
            完成注册。
          </p>
          <p className="mt-2 text-xs font-normal leading-5 text-[#99a1af]">
            若暂时未收到，请稍等几分钟，或查看垃圾箱、广告邮件夹。
          </p>

          {matchedWebmail ? (
            <a
              href={matchedWebmail.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press mt-5 flex h-9 w-full items-center justify-center rounded-[4px] bg-[#0055FF] text-xs font-medium text-white transition-colors hover:bg-[#0046CC]"
            >
              打开 {matchedWebmail.label}
            </a>
          ) : null}

          <p className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-[0.06em] text-[#6a7282]">
            {matchedWebmail ? "其它常用邮箱" : "打开网页邮箱"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {otherWebmailLinks.map((entry) => (
              <a
                key={entry.url}
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-press flex h-9 items-center justify-center rounded-[4px] border border-[#e5e7eb] bg-white text-xs font-medium text-[#101828] transition-colors hover:bg-[#f9fafb]"
              >
                {entry.label}
              </a>
            ))}
          </div>

          <Link
            href="/login"
            className="mt-6 inline-block text-sm font-medium text-[#6a7282] underline-offset-2 transition-colors hover:text-[#101828] hover:underline"
          >
            返回登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="modal-panel modal-panel-enter w-full max-w-[400px] p-6">
        <h1 id="register-dialog-title" className="sr-only">
          创建账号
        </h1>
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="inline-block text-lg font-semibold tracking-[-0.02em] text-[#101828]"
          >
            uAI News
          </Link>
          <p className="mt-1.5 text-sm font-normal leading-5 text-[#6a7282]">
            创建账号以保存收藏并同步订阅。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="register-email"
              className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#6a7282]"
            >
              邮箱
            </label>
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
              className="input-field h-9 w-full rounded-[4px] text-sm font-normal"
            />
          </div>

          <div>
            <label
              htmlFor="register-password"
              className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#6a7282]"
            >
              密码
            </label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              required
              autoComplete="new-password"
              className="input-field h-9 w-full rounded-[4px] text-sm font-normal"
            />
          </div>

          <div>
            <label
              htmlFor="register-confirm"
              className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#6a7282]"
            >
              确认密码
            </label>
            <input
              id="register-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              className="input-field h-9 w-full rounded-[4px] text-sm font-normal"
            />
          </div>

          {error && (
            <p className="rounded-[4px] bg-primary-50 px-3 py-2 text-sm font-normal text-primary-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn-press mt-1 flex h-9 w-full items-center justify-center rounded-[4px] bg-[#0055FF] text-xs font-medium text-white transition-colors hover:bg-[#0046CC] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "创建中…" : "创建账号"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm font-normal text-[#99a1af]">
          已有账号？{" "}
          <Link
            href="/login"
            className="font-medium text-[#101828] underline-offset-2 hover:underline"
          >
            登录
          </Link>
        </p>
      </div>
    </div>
  );
}
