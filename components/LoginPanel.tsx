"use client";

import { Suspense, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function LoginPanelInner() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";

  /** 仅允许站内路径，防止 open redirect */
  function safeRedirectPath(raw: string): string {
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
    return raw;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const networkErrorHint =
      "无法连接认证服务。请检查网络，或在 .env.local 中将 NEXT_PUBLIC_SUPABASE_URL 设为 Supabase 控制台 Settings → API 中的「Project URL」（域名必须能解析）。";

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        const msg = authError.message || "";
        const looksNetwork =
          msg === "Failed to fetch" ||
          /network|fetch failed|load failed/i.test(msg);
        setError(
          looksNetwork
            ? networkErrorHint
            : authError.message === "Invalid login credentials"
              ? "邮箱或密码错误，请重试。"
              : authError.message
        );
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch (unknownErr) {
      const err = unknownErr instanceof Error ? unknownErr : new Error(String(unknownErr));
      const looksNetwork =
        err.message === "Failed to fetch" || err.name === "TypeError";
      setError(looksNetwork ? networkErrorHint : err.message);
    } finally {
      /** 成功时原先未 reset：拦截路由下 router.push 可能不立刻卸载弹窗，会永远停在 Signing in… */
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="mb-6 text-center">
        <Link
          href="/"
          className="inline-block text-lg font-semibold tracking-[-0.02em] text-[#101828]"
        >
          uAI News
        </Link>
        <p className="mt-1.5 text-sm font-normal leading-5 text-[#6a7282]">
          登录以使用完整功能。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="login-email"
            className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#6a7282]"
          >
            邮箱
          </label>
          <input
            id="login-email"
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
            htmlFor="login-password"
            className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#6a7282]"
          >
            Password
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
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
          {isLoading ? "登录中…" : "登录"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm font-normal text-[#99a1af]">
        还没有账号？{" "}
        <Link
          href="/register"
          className="font-medium text-[#101828] underline-offset-2 hover:underline"
        >
          立即注册
        </Link>
      </p>
    </>
  );
}

function LoginPanelFallback() {
  return (
    <div className="flex min-h-[280px] items-center justify-center text-sm font-normal text-[#99a1af]">
      加载中…
    </div>
  );
}

export default function LoginPanel() {
  return (
    <Suspense fallback={<LoginPanelFallback />}>
      <LoginPanelInner />
    </Suspense>
  );
}
