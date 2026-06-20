"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import type { NewsItem } from "@/lib/types";
import AppModalShell from "./AppModalShell";

type AddLongformModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onImported: (post: NewsItem) => void;
};

type ImportResponse = {
  success?: boolean;
  error?: string;
  post?: NewsItem;
};

const MAX_FILE_BYTES = 4 * 1024 * 1024;

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

export default function AddLongformModal({
  isOpen,
  onClose,
  onImported,
}: AddLongformModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setUrl("");
    setFile(null);
    setError("");
    setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const closeModal = () => {
    if (isLoading) return;
    reset();
    onClose();
  };

  const setSelectedFile = (nextFile: File | null) => {
    setError("");
    if (!nextFile) {
      setFile(null);
      return;
    }

    if (nextFile.size > MAX_FILE_BYTES) {
      setError("文件太大，请上传 4MB 以内的文章文件。");
      setFile(null);
      return;
    }

    setFile(nextFile);
    setUrl("");
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] ?? null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    setSelectedFile(event.dataTransfer.files?.[0] ?? null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;

    const trimmedUrl = url.trim();
    if (!trimmedUrl && !file) {
      setError("请输入文章 URL，或拖入一个文章文件。");
      return;
    }

    const formData = new FormData();
    if (file) {
      formData.append("file", file);
    } else {
      formData.append("url", trimmedUrl);
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/longform/import", {
        method: "POST",
        body: formData,
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = (await response.json().catch(() => ({}))) as ImportResponse;

      if (!response.ok || !result.success || !result.post) {
        setError(result.error || "添加失败，请稍后再试。");
        return;
      }

      onImported(result.post);
      router.refresh();
      reset();
      onClose();
    } catch (err) {
      console.error("Longform import failed:", err);
      setError("添加失败，请检查网络后重试。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppModalShell
      isOpen={isOpen}
      onClose={closeModal}
      disableBackdropClick={isLoading}
      panelClassName="max-w-[520px] overflow-hidden p-0"
      ariaLabelledBy="add-longform-title"
    >
      <header className="app-divider-border-b flex items-start justify-between px-5 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <h2
            id="add-longform-title"
            className="m-0 text-[15px] font-semibold leading-5 tracking-[-0.02em] text-[#101828]"
          >
            添加长文
          </h2>
        </div>
        <button
          type="button"
          onClick={closeModal}
          disabled={isLoading}
          className="btn-press -mr-1 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#6a7282] transition-colors hover:bg-[#f3f4f6] hover:text-[#101828] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="关闭"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-5 py-5">
        <div>
          <label
            htmlFor="longform-url"
            className="mb-2 block text-xs font-medium uppercase tracking-wide text-[#6a7282]"
          >
            文章 URL
          </label>
          <input
            id="longform-url"
            className="input-field h-10 w-full text-sm"
            placeholder="https://..."
            value={url}
            disabled={isLoading || file != null}
            onChange={(event) => {
              setError("");
              setUrl(event.target.value);
            }}
          />
        </div>

        <div className="flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-[#f3f4f6]" />
          <span className="text-[12px] leading-[18px] text-[#99a1af]">或</span>
          <span className="h-px flex-1 bg-[#f3f4f6]" />
        </div>

        <div
          className={[
            "flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-5 text-center transition-colors",
            isDragging
              ? "border-primary-500 bg-primary-50"
              : "border-[#e5e7eb] bg-[#fcfcfd] hover:border-[#d7a220] hover:bg-white",
          ].join(" ")}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          aria-label="选择或拖入文章文件"
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".txt,.md,.markdown,.html,.htm,.xml,.json,text/plain,text/markdown,text/html"
            disabled={isLoading}
            onChange={handleFileChange}
          />
          <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-md border border-[#e5e7eb] bg-white text-[#6a7282]">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16V4m0 0 4 4m-4-4-4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
          </span>
          <p className="m-0 text-sm font-medium leading-5 text-[#101828]">
            {file ? file.name : "拖入文章文件"}
          </p>
          <p className="m-0 mt-1 text-[12px] leading-[18px] text-[#6a7282]">
            {file ? formatFileSize(file.size) : "txt / md / html"}
          </p>
        </div>

        {file ? (
          <button
            type="button"
            className="btn-press self-start text-[12px] font-medium leading-[18px] text-[#6a7282] transition-colors hover:text-[#101828] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30"
            disabled={isLoading}
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          >
            移除文件
          </button>
        ) : null}

        {error ? (
          <p className="m-0 rounded-md border border-primary-100 bg-primary-50 px-3 py-2 text-[13px] leading-5 text-primary-700">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-[#f3f4f6] pt-4">
          <button
            type="button"
            className="btn-primary btn-press h-9 px-4 text-sm font-medium"
            disabled={isLoading}
            onClick={closeModal}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="btn-press inline-flex h-9 min-w-[104px] items-center justify-center gap-2 rounded-md bg-primary-500 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
            ) : null}
            {isLoading ? "处理中" : "添加文章"}
          </button>
        </div>
      </form>
    </AppModalShell>
  );
}
