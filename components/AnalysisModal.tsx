"use client";

import type { NewsItem } from "@/lib/types";
import AppModalShell from "@/components/AppModalShell";
import { BoldLinkifiedInline } from "@/components/LinkifiedParagraph";

type AnalysisData = {
  scores?: number | null;
  reliability?: number | null;
  review?: string | string[] | null;
  contextMatch?: string | null;
  originalTranslation?: string | null;
  originalTranslationReferenced?: string | null;
};

type AnalysisModalProps = {
  isOpen: boolean;
  post: NewsItem | null;
  analysis?: AnalysisData | null;
  isLoading?: boolean;
  onClose: () => void;
};

export default function AnalysisModal({ isOpen, post, analysis, isLoading = false, onClose }: AnalysisModalProps) {
  const scores =
    typeof analysis?.scores === "number"
      ? Math.max(0, Math.min(100, analysis.scores))
      : typeof post?.importanceScore === "number"
        ? Math.max(0, Math.min(100, post.importanceScore))
        : null;

  const reliability =
    typeof analysis?.reliability === "number"
      ? Math.max(0, Math.min(100, analysis.reliability))
      : null;

  const contextMatch = analysis?.contextMatch ?? null;

  if (!isOpen || !post) return null;

  return (
    <AppModalShell
      isOpen
      onClose={onClose}
      panelVariant="large"
      backdropAriaLabel="关闭解读"
      panelClassName="max-w-[920px] max-h-[86vh] overflow-hidden flex flex-col p-0"
    >
        <div className="app-divider-border-b sticky top-0 flex items-center justify-between bg-white px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#101828]">
              Insight
            </span>
            <span className="app-divider-v h-4 flex-shrink-0" />
            <span className="truncate text-sm font-normal text-[#6a7282]">
              {post.title}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors"
            aria-label="关闭"
          >
            <svg className="w-4 h-4 text-[#6a7282]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          <div className="space-y-4">
            {/* PRO (fixed, non-AI) */}
            <section className="border border-[#f3f4f6] rounded-[14px] p-4">
              <div className="text-xs font-semibold tracking-wide text-[#FFB224] mb-2">专业版</div>
              <div className="text-sm font-normal text-[#101828]">
                实时 AI 解析与深度摘要。
              </div>
            </section>

            {/* SIGNIFICANCE SCORE (AI-derived; modal 较宽可用全称) */}
            <section className="border border-[#f3f4f6] rounded-[14px] p-4">
              <div className="flex items-baseline gap-2">
                <div className="text-xs font-semibold tracking-wide text-[#6a7282]">重要度</div>
                <div className="text-2xl font-bold text-[#FFB224]">
                  {isLoading ? "..." : (scores ?? "-")}
                </div>
                <div className="text-sm font-medium text-[#6a7282]">/100</div>
              </div>
              <div className="mt-2 text-sm font-normal text-[#6a7282]">
                {typeof scores === "number"
                  ? scores >= 80
                    ? "高优先级"
                    : scores >= 50
                      ? "值得关注"
                      : "一般关注"
                  : ""}
              </div>
            </section>

            {/* RELIABILITY */}
            <section className="border border-[#f3f4f6] rounded-[14px] p-4">
              <div className="text-xs font-semibold tracking-wide text-[#6a7282] mb-2">可信度</div>
              <div className="text-lg font-semibold text-[#6a7282]">
                {isLoading ? "..." : (typeof reliability === "number" ? `${reliability}%` : "-")}
              </div>
            </section>

            {/* RELEVANCE（与侧栏一致，支持 **加粗**） */}
            <section className="border border-[#f3f4f6] rounded-[14px] p-4">
              <div className="text-xs font-semibold tracking-wide text-[#6a7282] mb-2">启发</div>
              <div className="text-sm text-[#6a7282] whitespace-pre-wrap">
                {isLoading ? (
                  "..."
                ) : contextMatch ? (
                  <BoldLinkifiedInline text={contextMatch} />
                ) : (
                  "-"
                )}
              </div>
            </section>
          </div>
        </div>
    </AppModalShell>
  );
}

