"use client";

import { usePathname, useRouter } from "next/navigation";
import AppModalShell from "@/components/AppModalShell";
import LoginPanel from "@/components/LoginPanel";

type LoginModalShellProps = {
  /** 受控模式：不依赖 /login 路由与 @modal 拦截 */
  controlledOpen?: boolean;
  onControlledClose?: () => void;
};

export default function LoginModalShell({
  controlledOpen,
  onControlledClose,
}: LoginModalShellProps = {}) {
  const router = useRouter();
  const pathname = usePathname();

  const routeOpen = pathname === "/login";
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : routeOpen;

  if (!isOpen) {
    return null;
  }

  const handleClose = () => {
    if (onControlledClose) {
      onControlledClose();
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <AppModalShell
      isOpen
      onClose={handleClose}
      backdropAriaLabel="关闭登录"
      panelClassName="max-w-[400px] p-6"
    >
      <button
        type="button"
        aria-label="关闭登录窗口"
        onClick={handleClose}
        className="btn-press absolute right-3 top-3 z-[2] flex h-8 w-8 items-center justify-center rounded-md text-[#99a1af] transition-colors hover:bg-[#f5f5f5] hover:text-[#101828]"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 6l12 12M18 6L6 18"
          />
        </svg>
      </button>
      <h1 id="login-dialog-title" className="sr-only">
        登录
      </h1>
      <LoginPanel hardRedirectAfterLogin={isControlled} />
    </AppModalShell>
  );
}
