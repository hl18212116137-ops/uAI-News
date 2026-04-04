"use client";

import { useRouter } from "next/navigation";
import AppModalShell from "@/components/AppModalShell";
import LoginPanel from "@/components/LoginPanel";

export default function LoginModalShell() {
  const router = useRouter();

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
