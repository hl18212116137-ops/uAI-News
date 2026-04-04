"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type AddedSourcePayload = {
  id: string;
  handle: string;
  name: string;
  avatar?: string;
  description?: string;
  sourceType?: string;
};

type AddSourceModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** 由父组件增量同步侧栏与 feed 时传入；不传则成功后仍整页 refresh */
  onSourceAdded?: (payload: { source: AddedSourcePayload; taskId?: string }) => void;
};

export default function AddSourceModal({
  isOpen,
  onClose,
  onSourceAdded,
}: AddSourceModalProps) {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const router = useRouter();

  useEffect(() => {
    if (isOpen && position.x === 0 && position.y === 0) {
      const modalWidth = 480;
      const modalHeight = 380;
      const centerX = (window.innerWidth - modalWidth) / 2;
      const centerY = (window.innerHeight - modalHeight) / 2;
      setPosition({ x: centerX, y: Math.max(centerY, 40) });
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
      setError("Enter a URL");
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
        onClose();
        const src = result.source as AddedSourcePayload | undefined;
        if (onSourceAdded && src?.id) {
          onSourceAdded({ source: src, taskId: result.taskId as string | undefined });
        } else {
          router.refresh();
        }
      } else {
        setError(result.error || "Could not add source. Try again.");
      }
    } catch (err) {
      console.error("Add source failed:", err);
      setError("Something went wrong. Try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close dialog"
        className="modal-backdrop fixed inset-0 z-[100]"
        onClick={onClose}
      />

      <div
        className="modal-panel modal-panel-enter fixed z-[101] flex w-[480px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg p-0"
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
        <header className="flex items-start justify-between border-b border-[#ebebef] px-5 pb-4 pt-5">
          <div
            className="min-w-0 flex-1 cursor-grab select-none active:cursor-grabbing"
            onMouseDown={handleMouseDown}
          >
            <h2
              id="add-source-title"
              className="m-0 text-[15px] font-semibold leading-5 tracking-[-0.02em] text-[#101828]"
            >
              Add New Source
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            className="btn-press -mr-1 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#6a7282] transition-colors hover:bg-[#f3f4f6] hover:text-[#101828]"
            aria-label="Close"
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
        </header>

        <div className="flex flex-col gap-5 px-5 py-5">
          <div>
            <label
              htmlFor="add-source-url"
              className="mb-2 block text-xs font-medium uppercase tracking-wide text-[#6a7282]"
            >
              Source URL
            </label>
            <input
              id="add-source-url"
              type="text"
              inputMode="url"
              placeholder="https://x.com/karpathy"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddSource();
              }}
              className="h-9 w-full rounded-md border border-[#ebebef] bg-white px-3 text-[13px] font-normal leading-5 text-[#101828] shadow-[inset_0_1px_0_rgba(0,0,0,0.03)] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-[#99a1af] hover:border-[#e0e0e0] focus:border-[#0055FF]/40 focus:shadow-[inset_0_1px_0_rgba(0,0,0,0.03),0_0_0_3px_rgba(0,85,255,0.14)] disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="flex gap-3 rounded-md border border-[#f0f0f0] bg-[#fafafa] px-3.5 py-3">
            <div
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0055FF] text-[10px] font-bold leading-none text-white"
              aria-hidden
            >
              i
            </div>
            <div className="min-w-0 font-mono text-[11px] leading-[1.55] text-[#4a5565]">
              <span className="font-semibold text-[#0055FF]">SYSTEM_NOTE:</span>{" "}
              <span className="font-normal">
                New sources are crawled immediately after you add them to verify
                RSS/API compatibility. Typical latency: ~200ms.
              </span>
            </div>
          </div>

          {error && (
            <p className="m-0 rounded-md border border-primary-100 bg-primary-50 px-3 py-2 text-[13px] font-normal leading-5 text-primary-600">
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-1 border-t border-[#ebebef] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="btn-press rounded-md px-3 py-2 text-[13px] font-medium text-[#6a7282] transition-colors duration-150 ease-out hover:bg-[#f5f5f5] hover:text-[#101828] disabled:pointer-events-none disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAddSource}
            disabled={isLoading}
            className="btn-press ml-1 inline-flex h-8 min-w-[96px] items-center justify-center rounded-md bg-[#0055FF] px-3.5 text-[13px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_1px_2px_rgba(0,0,0,0.08)] transition-[background-color,box-shadow,opacity] duration-150 ease-out hover:bg-[#0046CC] hover:shadow-[0_1px_0_rgba(255,255,255,0.14)_inset,0_2px_4px_rgba(0,85,255,0.25)] active:bg-[#003db3] disabled:pointer-events-none disabled:opacity-50"
          >
            {isLoading ? "Adding…" : "Add Source"}
          </button>
        </footer>
      </div>
    </>
  );
}
