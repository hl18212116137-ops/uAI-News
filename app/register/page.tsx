"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { mapSignInError } from "@/lib/auth-errors";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

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

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "注册失败，请稍后重试");
        setIsLoading(false);
        return;
      }

      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (!result || result.error || result.ok === false) {
        setError(mapSignInError(result?.error));
        return;
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError("网络错误，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  };

  const shell = "flex min-h-dvh items-center justify-center bg-[#f5f5f5] px-4 py-10";

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
              htmlFor="register-name"
              className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#6a7282]"
            >
              昵称（可选）
            </label>
            <input
              id="register-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="你的昵称"
              autoComplete="name"
              className="input-field h-9 w-full rounded-[4px] text-sm font-normal"
            />
          </div>

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
          <a
            href="/login"
            className="font-medium text-[#101828] underline-offset-2 hover:underline"
          >
            登录
          </a>
        </p>
      </div>
    </div>
  );
}
