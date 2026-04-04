"use client";

import { memo, useEffect, useState } from "react";
import { NewsItem } from "@/lib/types";
import { isNewPost, formatTypography } from "@/lib/utils";
import Tooltip from "./Tooltip";
import SourceAvatarImg from "./SourceAvatarImg";
import { FeedInsightSparkleGlyph } from "@/components/feed-inline-icons";

function formatDateZH(dateString: string): string {
  const d = new Date(dateString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/** 本地时区，24 小时制 */
function formatTimeLocalHM(dateString: string): string {
  const d = new Date(dateString);
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

function getCategoryTag(category: NewsItem["category"]) {
  switch (category) {
    case "Model Update":
      return "MODELS";
    case "Company News":
      return "INDUSTRY";
    case "Funding":
      return "FUNDING";
    case "Policy":
      return "POLICY";
    case "Research":
      return "RESEARCH";
    case "Product Update":
      return "PRODUCTS";
    case "Open Source":
      return "OPEN SOURCE";
    case "Other":
    default:
      return "OTHER";
  }
}

type NewsCardProps = {
  post: NewsItem;
  variant?: "default" | "compact";
  isBookmarked?: boolean;
  onBookmarkToggle?: (id: string) => void;
  readonly?: boolean;
  analysisActive?: boolean;
  onAnalysisToggle?: (postId: string) => void;
  avatarPriority?: boolean;
};

export default memo(NewsCard);

function NewsCard({
  post,
  variant = "default",
  isBookmarked = false,
  onBookmarkToggle,
  readonly = false,
  analysisActive = false,
  onAnalysisToggle,
  avatarPriority = false,
}: NewsCardProps) {
  const sourceName = post.source?.name || "未知来源";
  const sourceUrl = post.source?.url || "#";
  const sourceAvatar = post.source?.avatar;
  const avatarLetter = (sourceName || post.source?.handle || "?").charAt(0).toUpperCase();
  /** isNewPost 依赖 sessionStorage，SSR 与首帧客户端必须一致，故挂载后再算 */
  const [showNewBadge, setShowNewBadge] = useState(false);
  useEffect(() => {
    setShowNewBadge(isNewPost(post.createdAt));
  }, [post.createdAt]);

  const articlePad =
    variant === "compact"
      ? "pt-10 pb-12"
      : "pt-[48px] pb-[64px]";

  return (
    <article
      data-name="Article"
      data-node-id="37:4741"
      className={[
        "relative flex w-full shrink-0 flex-col items-start gap-[32px] rounded-[2px]",
        analysisActive ? "bg-[rgba(255,178,36,0.02)]" : "bg-white",
        articlePad,
      ].join(" ")}
    >
      {/* 右侧金条由 NewsList 统一绘制并平移 */}

      {/* Figma 无收藏位；产品保留为右上角绝对定位，不挤占 meta 行 */}
      {readonly ? (
        <div
          className="absolute right-[32px] top-[48px] z-[1] flex h-6 w-6 items-center justify-center rounded-[10px]"
          aria-hidden
        >
          <svg
            className={`h-4 w-4 ${isBookmarked ? "text-[#d7a220]" : "text-[#99a1af]"}`}
            fill={isBookmarked ? "currentColor" : "none"}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
            />
          </svg>
        </div>
      ) : onBookmarkToggle ? (
        <Tooltip content={isBookmarked ? "取消收藏" : "收藏这篇文章"}>
          <button
            type="button"
            className="absolute right-[32px] top-[48px] z-[1] flex h-6 w-6 items-center justify-center rounded-[10px] transition-colors hover:bg-black/[0.04]"
            aria-label={isBookmarked ? "取消收藏" : "收藏"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onBookmarkToggle(post.id);
            }}
          >
            <svg
              className={`h-4 w-4 transition-colors ${isBookmarked ? "text-[#d7a220]" : "text-[#99a1af]"}`}
              fill={isBookmarked ? "currentColor" : "none"}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          </button>
        </Tooltip>
      ) : null}

      <div className="flex w-full min-w-0 flex-col gap-[32px]">
        <div className="flex w-full min-w-0 items-start gap-3">
          <div className="shrink-0">
            <SourceAvatarImg
              src={sourceAvatar}
              alt={sourceName}
              letter={avatarLetter}
              imgClassName="h-6 w-6 rounded-[2px] border border-[#F0F0F2] object-cover shadow-xs"
              placeholderClassName="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[2px] border border-[#F0F0F2] bg-gray-200 text-[11px] font-semibold text-[#6a7282] shadow-xs"
              priority={avatarPriority}
            />
          </div>
          <div
            data-name="Container"
            data-node-id="37:4742"
            className="flex min-w-0 flex-1 flex-wrap items-center gap-[4px]"
          >
            <span
              className="flex h-[17px] shrink-0 items-center font-mono text-[11px] font-bold uppercase leading-[16.5px] tracking-[1.1px] text-[#05f]"
              data-node-id="37:4744"
            >
              # {getCategoryTag(post.category)}
            </span>
            <span
              className="flex h-[17px] items-center font-mono text-[11px] font-normal uppercase leading-[16.5px] tracking-[1.1px] text-[rgba(161,161,170,0.5)]"
              data-node-id="37:4746"
            >
              /
            </span>
            <span
              className="flex min-h-[17px] min-w-0 items-center tabular-nums font-mono text-[11px] font-normal leading-[16.5px] tracking-[1.1px] text-[#8a8a93]"
              data-node-id="37:4748"
            >
              {formatDateZH(post.publishedAt)}
            </span>
            <span
              className="flex h-[17px] items-center font-mono text-[11px] font-normal uppercase leading-[16.5px] tracking-[1.1px] text-[rgba(161,161,170,0.5)]"
              data-node-id="37:4750"
            >
              /
            </span>
            <span
              className="flex h-[17px] items-center tabular-nums font-mono text-[11px] font-normal leading-[16.5px] tracking-[1.1px] text-[#8a8a93]"
              data-node-id="37:4752"
            >
              {formatTimeLocalHM(post.publishedAt)}
            </span>
            {showNewBadge ? (
              <>
                <span className="flex h-[17px] items-center font-mono text-[11px] uppercase leading-[16.5px] tracking-[1.1px] text-[rgba(161,161,170,0.5)]">
                  /
                </span>
                <span className="flex h-[17px] items-center font-mono text-[11px] font-bold uppercase leading-[16.5px] tracking-[1.1px] text-[#fb2c36]">
                  NEW
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div
          data-name="Container"
          data-node-id="37:4753"
          className="flex min-w-0 w-full max-w-full flex-col gap-[16px] pl-9"
        >
          <h2
            data-name="Heading 1"
            data-node-id="37:4754"
            className="m-0 min-w-0 font-sans text-[20px] font-bold leading-[27.5px] tracking-[-0.5px] text-[#18181b]"
          >
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="motion-layout-ease transition-colors hover:text-primary-600"
            >
              {formatTypography(post.title)}
            </a>
          </h2>
          <p
            data-name="Container"
            data-node-id="37:4756"
            className="m-0 line-clamp-2 font-sans text-[14px] font-normal leading-[22px] text-[#52525b]"
          >
            {formatTypography(post.summary)}
          </p>
        </div>
      </div>

      {!readonly && onAnalysisToggle ? (
        <div
          className="absolute bottom-[24.5px] right-[32px] z-[1]"
          data-name={analysisActive ? "Overlay+Border+Shadow" : "Background+Border"}
          data-node-id={analysisActive ? "37:4759" : "37:4781"}
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAnalysisToggle(post.id);
            }}
            aria-pressed={analysisActive}
            className={[
              "motion-layout-ease flex items-center gap-[8px] rounded-[2px] px-[15px] py-[7px] font-sans text-[10px] font-bold uppercase leading-[10px] tracking-[0.8px] transition-opacity hover:opacity-90",
              analysisActive
                ? "border border-solid border-[#ffb224] bg-[rgba(255,178,36,0.1)] text-[#ffb224] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
                : "border border-solid border-[#e5e7eb] bg-white text-[#8a8a93]",
            ].join(" ")}
          >
            <span className="relative size-[14.667px] shrink-0" data-node-id="37:4760">
              <FeedInsightSparkleGlyph className="absolute inset-0 block size-full max-w-none" aria-hidden />
            </span>
            INSIGHT
          </button>
        </div>
      ) : null}
    </article>
  );
}
