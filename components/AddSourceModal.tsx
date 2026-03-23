"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

type AddSourceModalProps = {
  isOpen: boolean;
  onClose: () => void;
  sidebarWidth?: number;
  user: User | null;
};

export default function AddSourceModal({ isOpen, onClose, sidebarWidth = 320, user }: AddSourceModalProps) {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showGuestWarning, setShowGuestWarning] = useState(false);
  const router = useRouter();

  // 初始化弹窗位置（居中）
  useEffect(() => {
    if (isOpen && position.x === 0 && position.y === 0) {
      const modalWidth = 480;
      const modalHeight = 400;
      const centerX = (window.innerWidth - modalWidth) / 2;
      const centerY = (window.innerHeight - modalHeight) / 2;
      setPosition({ x: centerX, y: Math.max(centerY, 50) });
    }
  }, [isOpen]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    // 拖拽时禁用文本选择
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
    };
  }, [isDragging, dragOffset]);

  const handleAddSource = async () => {
    if (!url.trim()) {
      setError("请输入链接地址");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const result = await response.json();

      if (result.success) {
        setUrl("");
        // 如果未登录，显示提示
        if (!user) {
          setShowGuestWarning(true);
        } else {
          onClose();
          router.refresh();
        }
      } else {
        setError(result.error || "添加失败，请重试");
      }
    } catch (err) {
      console.error("添加失败：", err);
      setError("添加失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoLogin = () => {
    setShowGuestWarning(false);
    onClose();
    router.push('/login');
  };

  const handleConfirmGuest = () => {
    setShowGuestWarning(false);
    onClose();
  };

  if (!isOpen) return null;

  // 如果显示未登录提示
  if (showGuestWarning) {
    return (
      <>
        <div
          className="fixed bg-black/50 z-40 animate-fade-in"
          style={{
            left: `${sidebarWidth}px`,
            top: 0,
            right: 0,
            bottom: 0,
          }}
          onClick={() => setShowGuestWarning(false)}
        />

        <div
          className="fixed bg-white rounded-2xl p-8 w-[480px] shadow-lg animate-scale-in z-50"
          style={{
            left: `${(window.innerWidth - 480) / 2}px`,
            top: `${(window.innerHeight - 300) / 2}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-12 h-12 rounded-full bg-[#f9fafb] flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-[#6a7282]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <h3 className="text-lg font-semibold text-[#101828] text-center mb-2">
            你尚未登录
          </h3>
          <p className="text-sm text-[#6a7282] text-center mb-6">
            推文数据仅供阅览，不作保留
          </p>

          <div className="flex gap-3">
            <button
              onClick={handleConfirmGuest}
              className="flex-1 py-2 rounded-full border border-[#e5e7eb] text-sm text-[#6a7282] hover:bg-[#f9fafb] transition-colors"
            >
              确认
            </button>
            <button
              onClick={handleGoLogin}
              className="flex-1 py-2 rounded-full bg-[#101828] text-sm text-white font-medium hover:bg-[#1a1f2e] transition-colors"
            >
              去登录
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* 遮罩层，不覆盖 sidebar */}
      <div
        className="fixed bg-black/50 z-40 animate-fade-in"
        style={{
          left: `${sidebarWidth}px`,
          top: 0,
          right: 0,
          bottom: 0,
        }}
        onClick={onClose}
      />

      {/* 弹窗 */}
      <div
        className="fixed bg-white rounded-2xl p-8 pb-0 w-[480px] shadow-lg animate-scale-in z-50"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          cursor: isDragging ? "grabbing" : "default",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mb-6 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
        >
          <h3 className="text-lg font-semibold text-[#101828] mb-2">
            添加信息源
          </h3>
          <p className="text-sm text-[#6a7282]">
            复制博主主页、媒体网站或学术网站地址，以添加信息源
          </p>
        </div>

        <input
          type="text"
          placeholder="粘贴链接地址"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddSource();
          }}
          className="w-full bg-[#f9fafb] rounded-[10px] px-4 py-3 border border-[#e3e5ea] text-sm placeholder-[#99a1af] focus:outline-none focus:ring-2 focus:ring-[#101828] transition-all duration-200 mb-6"
        />

        {error && (
          <p className="text-sm text-red-500 mb-4">{error}</p>
        )}

        <div className="flex gap-3 justify-end pb-8">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-[#4a5565] hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleAddSource}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-[#101828] rounded-full hover:bg-[#1a1f2e] transition-colors disabled:opacity-50"
          >
            {isLoading ? "添加中..." : "添加"}
          </button>
        </div>
      </div>
    </>
  );
}
