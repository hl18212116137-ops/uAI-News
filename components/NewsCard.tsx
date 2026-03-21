import { memo } from "react";
import Image from "next/image";
import { NewsItem, CATEGORY_ZH_MAP } from "@/lib/types";
import { isNewPost, formatTypography } from "@/lib/utils";
import Tooltip from "./Tooltip";

function formatDateZH(dateString: string): string {
  const d = new Date(dateString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

type SourceMeta = {
  id: string;
  handle: string;
  name: string;
  avatar?: string;
};

type NewsCardProps = {
  post: NewsItem;
  variant?: "default" | "compact";
  sources?: SourceMeta[];
  isBookmarked?: boolean;
  onBookmarkToggle?: (id: string) => void;
  readonly?: boolean; // Server Component 环境下使用，不渲染 onClick
};

export default memo(NewsCard);

function NewsCard({ post, variant = "default", sources = [], isBookmarked = false, onBookmarkToggle, readonly = false }: NewsCardProps) {
  const sourceHandle = post.source?.handle || '';
  const sourceName = post.source?.name || '未知来源';
  const sourceUrl = post.source?.url || '#';
  const isNew = isNewPost(post.createdAt);

  // 从 sources 列表匹配头像
  const matched = sources.find(s => s.handle?.toLowerCase() === sourceHandle.toLowerCase());
  const avatar = matched?.avatar;

  // 计算阅读时间（粗略估算：按平均阅读速度 200 字/分钟）
  const wordCount = post.summary?.length || 0;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  const containerClass = variant === "compact"
    ? "rounded-2xl px-[28px] py-[14px] bg-white border border-[#f3f4f6]"
    : "rounded-2xl px-[28px] pt-[20px] pb-[14px] bg-white border border-[#f3f4f6]";

  return (
    <div className={containerClass}>
      {/* 顶部行：分类 · 新推 | 收藏 */}
      <div className="flex items-center justify-between h-6" style={{ marginBottom: '12px' }}>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#99a1af]"># {CATEGORY_ZH_MAP[post.category] ?? post.category}</span>
          {isNew && (
            <>
              <span className="text-[#d1d5dc]">·</span>
              <span className="text-[#fb2c36] font-medium">新推</span>
            </>
          )}
        </div>
        {readonly ? (
          // Server Component 环境：只展示收藏状态，不渲染 onClick
          <div className="w-6 h-6 rounded-[10px] flex items-center justify-center flex-shrink-0">
            <svg
              className={`w-4 h-4 ${isBookmarked ? 'text-[#d7a220]' : 'text-[#99a1af]'}`}
              fill={isBookmarked ? "currentColor" : "none"}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          </div>
        ) : (
          <Tooltip content={isBookmarked ? "取消收藏" : "收藏这篇文章"}>
            <button
              className="w-6 h-6 rounded-[10px] flex items-center justify-center hover:bg-gray-100 transition-colors flex-shrink-0"
              aria-label={isBookmarked ? "取消收藏" : "收藏"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onBookmarkToggle?.(post.id);
              }}
            >
              <svg
                className={`w-4 h-4 transition-colors ${isBookmarked ? 'text-[#d7a220]' : 'text-[#99a1af]'}`}
                fill={isBookmarked ? "currentColor" : "none"}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              </svg>
            </button>
          </Tooltip>
        )}
      </div>

      {/* 标题 */}
      <h2 className="text-xl font-semibold text-[#101828] leading-snug" style={{ marginBottom: '12px' }}>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary-600 transition-colors duration-200"
        >
          {formatTypography(post.title)}
        </a>
      </h2>

      {/* 摘要 */}
      <p className="text-sm text-[#4a5568] leading-[1.625] line-clamp-2" style={{ marginBottom: '20px' }}>
        {formatTypography(post.summary)}
      </p>

      {/* 底部元数据：头像 · 作者名 · 日期 · 阅读时间 */}
      <div className="flex items-center gap-2 text-xs text-[#b5bcc4]" style={{ marginBottom: '12px' }}>
        {avatar ? (
          <Image
            src={avatar}
            alt={sourceName}
            width={16}
            height={16}
            className="rounded-full flex-shrink-0 object-cover"
          />
        ) : (
          <div className="w-4 h-4 rounded-full bg-gray-200 flex-shrink-0" />
        )}
        <span>{sourceName}</span>
        <span className="text-[#d1d5dc]">·</span>
        <span>{formatDateZH(post.publishedAt)}</span>
        <span className="text-[#d1d5dc]">·</span>
        <span>{readTime}分钟</span>
      </div>
    </div>
  );
}
