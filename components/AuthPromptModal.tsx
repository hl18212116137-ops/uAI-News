"use client";

import { useRouter } from "next/navigation";
import AppModalShell from "@/components/AppModalShell";

type AuthPromptModalProps = {
  isOpen: boolean;
  onClose: () => void;
  message?: string;
};

export default function AuthPromptModal({
  isOpen,
  onClose,
  message = "使用此功能需要先登录。",
}: AuthPromptModalProps) {
  const router = useRouter();

  const handleGoLogin = () => {
    onClose();
    router.push("/login");
  };

  return (
    <AppModalShell
      isOpen={isOpen}
      onClose={onClose}
      backdropAriaLabel="关闭对话框"
      ariaLabelledBy="auth-prompt-title"
      panelClassName={[
        "max-w-[440px] overflow-hidden p-0",
        "rounded-xl border border-[#e8eaef]",
        "bg-white",
        "shadow-[0_0_0_1px_rgba(16,24,40,0.04),0_8px_32px_rgba(16,24,40,0.08),0_24px_64px_-16px_rgba(16,24,40,0.14)]",
      ].join(" ")}
    >
      <div className="relative">
        <div
          className="h-0.5 w-full bg-[#0055FF]"
          aria-hidden
        />

        <button
          type="button"
          onClick={onClose}
          className="btn-press absolute right-3 top-3 z-[1] flex h-8 w-8 items-center justify-center rounded-lg text-[#99a1af] transition-colors duration-150 hover:bg-[#f4f5f7] hover:text-[#101828]"
          aria-label="关闭"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="px-6 pb-2 pt-7">
          <div className="flex gap-5">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0055FF]/10 to-[#0055FF]/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] ring-1 ring-[#0055FF]/10"
              aria-hidden
            >
              <svg
                className="h-[22px] w-[22px] text-[#0055FF]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.35}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>

            <div className="min-w-0 flex-1 pt-0.5 pr-6">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#99a1af]">
                Authentication
              </p>
              <h2
                id="auth-prompt-title"
                className="mt-2 text-[17px] font-semibold leading-[1.35] tracking-[-0.028em] text-[#101828]"
              >
                Sign in required
              </h2>
              <p className="mt-3 text-[14px] font-normal leading-[1.6] text-[#6a7282]">
                {message}
              </p>
            </div>
          </div>
        </div>
      </div>

      <footer className="app-divider-border-t flex items-center justify-end gap-2 bg-[#fafbfc] px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          className="btn-press inline-flex h-9 items-center justify-center rounded-lg border border-[#e2e4e9] bg-white px-4 text-[13px] font-medium text-[#101828] shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] transition-[border-color,background-color,box-shadow] duration-150 ease-out hover:border-[#d4d7de] hover:bg-[#f9fafb]"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleGoLogin}
          className="btn-press inline-flex h-9 min-w-[108px] items-center justify-center rounded-lg bg-[#0055FF] px-4 text-[13px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.14)_inset,0_1px_2px_rgba(0,85,255,0.25)] transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-[#0046CC] hover:shadow-[0_1px_0_rgba(255,255,255,0.16)_inset,0_4px_14px_rgba(0,85,255,0.35)] active:bg-[#003db3]"
        >
          登录
        </button>
      </footer>
    </AppModalShell>
  );
}
