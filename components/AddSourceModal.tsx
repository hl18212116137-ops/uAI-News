"use client";

import { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import SourceRecommendSection, { type RecommendSourceRow } from "@/components/SourceRecommendSection";
import { RECOMMENDED_SIDEBAR_LIMIT } from "@/lib/feed-quality";

type AddedSourcePayload = {
  id: string;
  handle: string;
  name: string;
  url?: string;
  avatar?: string;
  description?: string;
  sourceType?: string;
};

type AddSourceModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** 由父组件增量同步侧栏与 feed 时传入；不传则成功后仍整页 refresh */
  onSourceAdded?: (payload: { source: AddedSourcePayload; taskId?: string }) => void;
  recommendedSources?: RecommendSourceRow[];
  onRecommendedChange?: (sources: RecommendSourceRow[]) => void;
  subscribedIds?: Set<string>;
  subscribedHandles?: Set<string>;
  onSubscribe?: (source: RecommendSourceRow) => void | Promise<void>;
};

export default function AddSourceModal({
  isOpen,
  onClose,
  onSourceAdded,
  recommendedSources = [],
  onRecommendedChange,
  subscribedIds = new Set(),
  subscribedHandles = new Set(),
  onSubscribe,
}: AddSourceModalProps) {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPositionReady, setIsPositionReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isRefreshingRecommended, setIsRefreshingRecommended] = useState(false);
  const [recommendationError, setRecommendationError] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const recommendedRequestRef = useRef<Promise<RecommendSourceRow[] | null> | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!isOpen || recommendedSources.length > 0) return;
    let active = true;
    if (!recommendedRequestRef.current) {
      recommendedRequestRef.current = fetch(`/api/recommended-sources?limit=${RECOMMENDED_SIDEBAR_LIMIT}`, {
        cache: "no-store",
        credentials: "same-origin",
      })
        .then((res) => res.json())
        .then((data: { success?: boolean; sources?: RecommendSourceRow[] }) =>
          data.success && Array.isArray(data.sources) ? data.sources : null
        )
        .catch(() => null)
        .finally(() => {
          recommendedRequestRef.current = null;
        });
    }
    void recommendedRequestRef.current.then((sources) => {
      if (active && sources) {
        onRecommendedChange?.(sources);
      }
    });
    return () => {
      active = false;
    };
  }, [isOpen, recommendedSources.length, onRecommendedChange]);

  const handleRefreshRecommended = useCallback(async () => {
    setIsRefreshingRecommended(true);
    setRecommendationError("");
    try {
      const qs = new URLSearchParams({
        limit: String(RECOMMENDED_SIDEBAR_LIMIT),
        random: "1",
      });
      const excludeIds = recommendedSources.map((s) => s.id).filter(Boolean);
      const excludeHandles = recommendedSources.map((s) => s.handle).filter(Boolean);
      if (excludeIds.length) qs.set("excludeIds", excludeIds.join(","));
      if (excludeHandles.length) qs.set("excludeHandles", excludeHandles.join(","));
      const response = await fetch(`/api/recommended-sources?${qs.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await response.json();
      if (data.success && Array.isArray(data.sources)) {
        onRecommendedChange?.(data.sources);
      } else {
        setRecommendationError("推荐暂时无法刷新，请稍后重试。");
      }
    } catch (error) {
      console.error("Failed to refresh recommended sources:", error);
      setRecommendationError("推荐暂时无法刷新，请稍后重试。");
    } finally {
      setIsRefreshingRecommended(false);
    }
  }, [recommendedSources, onRecommendedChange]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setIsPositionReady(false);
      return;
    }

    const modalWidth = Math.min(480, window.innerWidth - 32);
    const modalHeight = Math.min(560, window.innerHeight * 0.85);
    const centerX = Math.max(16, (window.innerWidth - modalWidth) / 2);
    const centerY = Math.max(16, (window.innerHeight - modalHeight) / 2);
    setPosition({ x: centerX, y: centerY });
    setIsPositionReady(true);
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
      const panelRect = panelRef.current?.getBoundingClientRect();
      const panelWidth = panelRect?.width ?? Math.min(480, window.innerWidth - 32);
      const panelHeight = panelRect?.height ?? Math.min(560, window.innerHeight * 0.85);
      const nextX = e.clientX - dragOffset.x;
      const nextY = e.clientY - dragOffset.y;
      setPosition({
        x: Math.min(Math.max(12, nextX), Math.max(12, window.innerWidth - panelWidth - 12)),
        y: Math.min(Math.max(12, nextY), Math.max(12, window.innerHeight - panelHeight - 12)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

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
        credentials: "same-origin",
        body: JSON.stringify({ url: url.trim() }),
      });

      const result = await response.json();

      if (result.success) {
        setUrl("");
        const src = result.source as AddedSourcePayload | undefined;
        if (onSourceAdded && src?.id) {
          onSourceAdded({ source: src, taskId: result.taskId as string | undefined });
        } else {
          router.refresh();
        }
        onClose();
      } else {
        setError(result.error || "添加失败，请重试。");
      }
    } catch (err) {
      console.error("Add source failed:", err);
      setError("出错了，请稍后再试。");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <button
        type="button"
        aria-label="关闭对话框"
        className="modal-backdrop fixed inset-0 z-[100]"
        onClick={onClose}
      />

      {isPositionReady ? (
      <div
        ref={panelRef}
        className="modal-panel modal-panel-enter fixed z-[101] flex max-h-[min(720px,85vh)] w-[480px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg p-0"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          cursor: isDragging ? "grabbing" : "default",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-source-title"
      >
        <header className="app-divider-border-b flex items-start justify-between px-5 pb-4 pt-5">
          <div
            className="min-w-0 flex-1 cursor-grab select-none active:cursor-grabbing"
            onMouseDown={handleMouseDown}
          >
            <h2
              id="add-source-title"
              className="m-0 text-[15px] font-semibold leading-5 tracking-[-0.02em] text-[#101828]"
            >
              添加信息源
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            className="btn-press -mr-1 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#6a7282] transition-colors hover:bg-[#f3f4f6] hover:text-[#101828] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30"
            aria-label="关闭"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col gap-5 px-5 py-5">
            <div>
              <label
                htmlFor="add-source-url"
                className="mb-2 block text-xs font-medium uppercase tracking-wide text-[#6a7282]"
              >
                信息源链接
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="add-source-url"
                  type="text"
                  name="sourceUrl"
                  inputMode="url"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "add-source-error" : "add-source-help"}
                  placeholder="https://x.com/karpathy 或 @karpathy"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleAddSource();
                  }}
                  className="h-9 min-w-0 flex-1 rounded-md border border-[#ebebef] bg-white px-3 text-[13px] font-normal leading-5 text-[#101828] shadow-[inset_0_1px_0_rgba(0,0,0,0.03)] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-[#99a1af] hover:border-[#e0e0e0] focus:border-[#0055FF]/40 focus:shadow-[inset_0_1px_0_rgba(0,0,0,0.03),0_0_0_3px_rgba(0,85,255,0.14)] disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleAddSource}
                  disabled={isLoading}
                  className="btn-press inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-[#0055FF] px-3.5 text-[13px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_1px_2px_rgba(0,0,0,0.08)] transition-[background-color,box-shadow,opacity] duration-150 ease-out hover:bg-[#0046CC] hover:shadow-[0_1px_0_rgba(255,255,255,0.14)_inset,0_2px_4px_rgba(0,85,255,0.25)] active:bg-[#003db3] disabled:pointer-events-none disabled:opacity-50"
                >
                  {isLoading ? "添加中…" : "添加"}
                </button>
              </div>
            </div>

            <div
              id="add-source-help"
              className="flex gap-3 rounded-md border border-[#f0f0f0] bg-[#fafafa] px-3.5 py-3"
            >
              <div
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0055FF] text-[10px] font-bold leading-none text-white"
                aria-hidden
              >
                i
              </div>
              <div className="min-w-0 font-mono text-[11px] leading-[1.55] text-[#4a5565]">
                <span className="font-semibold text-[#0055FF]">提示：</span>{" "}
                <span className="font-normal">
                  添加后会立即抓取以校验 RSS/API 兼容性，通常很快完成。
                </span>
              </div>
            </div>

            {error && (
              <p
                id="add-source-error"
                className="m-0 rounded-md border border-primary-100 bg-primary-50 px-3 py-2 text-[13px] font-normal leading-5 text-primary-600"
                role="alert"
              >
                {error}
              </p>
            )}

            <SourceRecommendSection
              sources={recommendedSources}
              subscribedIds={subscribedIds}
              subscribedHandles={subscribedHandles}
              isRefreshing={isRefreshingRecommended}
              onRefresh={handleRefreshRecommended}
              onSubscribe={onSubscribe}
            />
            {recommendationError ? (
              <p
                className="m-0 text-[12px] font-normal leading-5 text-primary-600"
                role="status"
                aria-live="polite"
              >
                {recommendationError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      ) : null}
    </>
  );
}
