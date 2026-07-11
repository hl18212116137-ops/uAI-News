"use client";

import { SessionProvider } from "next-auth/react";

type ProvidersProps = {
  children: React.ReactNode;
};

/** 客户端 Session 上下文：登录/退出后 signIn、signOut、useSession 行为一致 */
export default function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider
      basePath="/api/auth"
      session={null}
      refetchOnWindowFocus={false}
      refetchInterval={0}
    >
      {children}
    </SessionProvider>
  );
}
