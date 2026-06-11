"use client";

import { useCallback } from "react";
import { useOptionalHomeLayout } from "@/components/HomeLayoutContext";

/** 首页走受控登录弹窗；其它页面全页跳转 /login（规避拦截路由下客户端导航失效）。 */
export function useOpenLogin() {
  const layout = useOptionalHomeLayout();

  return useCallback(() => {
    if (layout?.openLoginModal) {
      layout.openLoginModal();
      return;
    }
    window.location.assign("/login");
  }, [layout]);
}
