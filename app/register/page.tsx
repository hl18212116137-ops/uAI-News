"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
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
          ? "This email is already registered. Sign in instead."
          : authError.message
      );
      setIsLoading(false);
      return;
    }

    setSuccess(true);
    setIsLoading(false);
  };

  const shell = "flex min-h-dvh items-center justify-center bg-[#f5f5f5] px-4 py-10";

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
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1
            id="register-success-title"
            className="text-base font-semibold tracking-[-0.02em] text-[#101828]"
          >
            Check your email
          </h1>
          <p className="mt-2 text-sm font-normal leading-5 text-[#6a7282]">
            We sent a confirmation link to{" "}
            <span className="font-medium text-[#101828]">{email}</span>. Open it to activate your
            account.
          </p>
          <Link
            href="/login"
            className="btn-press mt-6 flex h-9 w-full items-center justify-center rounded-[4px] bg-[#0055FF] text-xs font-medium text-white transition-colors hover:bg-[#0046CC]"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="modal-panel modal-panel-enter w-full max-w-[400px] p-6">
        <h1 id="register-dialog-title" className="sr-only">
          Create account
        </h1>
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="inline-block text-lg font-semibold tracking-[-0.02em] text-[#101828]"
          >
            uAI News
          </Link>
          <p className="mt-1.5 text-sm font-normal leading-5 text-[#6a7282]">
            Create an account to save bookmarks and sync subscriptions.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="register-email"
              className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#6a7282]"
            >
              Email
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
              Password
            </label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
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
              Confirm password
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
            {isLoading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm font-normal text-[#99a1af]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-[#101828] underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
