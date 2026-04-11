"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TopBarProfileGlyph } from "@/components/top-bar-icons";

type UserMenuProps = {
  user: User;
  /** Figma 3:2668 顶栏：2686/2687 嵌套，外层 36×36 · rounded-[6px] */
  variant?: "default" | "toolbar";
  /** 双折叠顶栏 43:5039 / 43:5040 等稿面节点覆盖 */
  toolbarOuterNodeId?: string;
  toolbarInnerNodeId?: string;
};

export default function UserMenu({
  user,
  variant = "default",
  toolbarOuterNodeId = "3:2686",
  toolbarInnerNodeId = "3:2687",
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayName =
    user.user_metadata?.full_name || user.email?.split("@")[0] || "用户";

  const avatarUrl = user.user_metadata?.avatar_url;

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setIsOpen(false);
    router.refresh();
  };

  const isToolbar = variant === "toolbar";

  const defaultTriggerInner = (
    <>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#101828]">
          <span className="text-sm font-semibold text-white">{displayName.charAt(0).toUpperCase()}</span>
        </div>
      )}
      <span className="hidden max-w-[120px] truncate text-sm font-medium text-[#101828] sm:block">
        {displayName}
      </span>
      <svg className="h-4 w-4 shrink-0 text-[#6a7282]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </>
  );

  return (
    <div className="relative" ref={menuRef}>
      {isToolbar ? (
        <div
          data-name="Container"
          data-node-id={toolbarOuterNodeId}
          className="relative shrink-0 rounded-[6px] text-[#111113]"
        >
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex size-9 items-center justify-center rounded-[6px] bg-transparent p-0 transition-colors hover:bg-[#f5f5f5]"
            aria-label="用户菜单"
          >
            <span
              data-name="Container"
              data-node-id={toolbarInnerNodeId}
              className="relative flex size-5 shrink-0 items-center justify-center"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="block size-full rounded-[6px] object-cover"
                />
              ) : (
                <TopBarProfileGlyph className="block size-full max-w-none object-contain text-[#111113]" />
              )}
            </span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-gray-50"
          aria-label="用户菜单"
        >
          {defaultTriggerInner}
        </button>
      )}

      {isOpen && (
        <div className="animate-fade-in absolute right-0 top-full mt-2 w-48 rounded-xl border border-[#e5e7eb] bg-white py-1 shadow-md">
          <div className="app-divider-border-b px-4 py-2">
            <div className="truncate text-sm font-medium text-[#101828]">{displayName}</div>
            <div className="truncate text-xs text-[#99a1af]">{user.email}</div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isLoggingOut}
            className="w-full px-4 py-2 text-left text-sm text-[#6a7282] transition-colors hover:bg-[#f9fafb] hover:text-[#101828] disabled:opacity-50"
          >
            {isLoggingOut ? "退出中..." : "退出登录"}
          </button>
        </div>
      )}
    </div>
  );
}
