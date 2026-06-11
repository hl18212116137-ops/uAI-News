"use client";

import { Suspense, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSession, signIn, useSession } from "next-auth/react";
import { mapSignInError } from "@/lib/auth-errors";

type LoginPanelProps = {
  /** 首页受控弹窗：登录成功后整页刷新以同步 RSC Session */
  hardRedirectAfterLogin?: boolean;
};

function LoginPanelInner({ hardRedirectAfterLogin }: LoginPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { update: updateSession } = useSession();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";

  function safeRedirectPath(raw: string): string {
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
    return raw;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (!result || result.error || result.ok === false) {
        setError(mapSignInError(result?.error));
        return;
      }

      await updateSession();
      await getSession();
      const target = safeRedirectPath(redirectTo);
      if (hardRedirectAfterLogin) {
        window.location.assign(target);
        return;
      }
      router.push(target);
      router.refresh();
    } catch (unknownErr) {
      const err = unknownErr instanceof Error ? unknownErr : new Error(String(unknownErr));
      setError(err.message || "登录失败，请稍后重试");
    } finally {
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
            密码
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
        <a
          href="/register"
          className="font-medium text-[#101828] underline-offset-2 hover:underline"
        >
          立即注册
        </a>
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

export default function LoginPanel({ hardRedirectAfterLogin }: LoginPanelProps = {}) {
  return (
    <Suspense fallback={<LoginPanelFallback />}>
      <LoginPanelInner hardRedirectAfterLogin={hardRedirectAfterLogin} />
    </Suspense>
  );
}
