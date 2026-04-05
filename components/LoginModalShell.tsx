"use client";

import { usePathname, useRouter } from "next/navigation";
import AppModalShell from "@/components/AppModalShell";
import LoginPanel from "@/components/LoginPanel";

export default function LoginModalShell() {
  const router = useRouter();
  const pathname = usePathname();

  /**
   * 拦截路由下 @modal 槽在链到 /register 等其它路径时，有时会仍挂载本组件，z-[100] 遮罩挡住整页。
   * 仅在实际路由为 /login 时渲染弹层；全页 app/login/page 也只在 /login 下挂载，行为一致。
   */
  if (pathname !== "/login") {
    return null;
  }

  const handleClose = () => {
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
      backdropAriaLabel="Close sign in"
      panelClassName="max-w-[400px] p-6"
    >
      <h1 id="login-dialog-title" className="sr-only">
        Sign in
      </h1>
      <LoginPanel />
    </AppModalShell>
  );
}
