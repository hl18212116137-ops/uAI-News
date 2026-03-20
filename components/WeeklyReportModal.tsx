import { NewsItem } from "@/lib/types";
import { useState } from "react";

type WeeklyReportModalProps = {
  posts: NewsItem[];
  isOpen: boolean;
  onClose: () => void;
};

function getCurrentWeekLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const week = Math.ceil(now.getDate() / 7);
  return `${year} 年 ${month} 月 第 ${week} 周`;
}

export default function WeeklyReportModal({
  posts,
  isOpen,
  onClose,
}: WeeklyReportModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!isOpen || posts.length === 0) return null;

  const currentPost = posts[currentIndex];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-[1600px] w-full max-h-[1084px] overflow-hidden animate-scale-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#e5e5e5] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">⭐</span>
            <span className="text-sm font-semibold text-[#111111]">uAI 周报</span>
            <span className="bg-[#c8991a] text-[#a67a18] text-xs font-semibold rounded px-2 py-1">
              第 {currentIndex + 1} 期
            </span>
            <div className="w-px h-3.5 bg-[#e0e0e0]" />
            <span className="text-sm text-[#888888]">{getCurrentWeekLabel()}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[#888888]">
              {currentIndex + 1} / {posts.length}
            </span>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors"
            >
              <svg
                className="w-4 h-4 text-[#888888]"
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
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - TOC */}
          <div className="w-60 bg-[#fafafa] border-r border-[#f0f0f0] overflow-y-auto">
            <div className="p-4">
              <h3 className="text-[10.5px] font-semibold text-[#aaaaaa] mb-4">
                本期内容
              </h3>
              <div className="space-y-1">
                {posts.map((post, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-full text-left px-3 py-2.5 rounded text-sm transition-colors ${
                      idx === currentIndex
                        ? "bg-white"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10.5px] font-semibold ${
                          idx === currentIndex
                            ? "text-[#c8991a]"
                            : "text-[#cccccc]"
                        }`}
                      >
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`text-xs truncate ${
                          idx === currentIndex
                    ? "text-[#0a0a0a]"
                            : "text-[#6b6b6b]"
                        }`}
                      >
                        {post.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1 ml-6">
                      <span className="text-[10.5px] text-[#e05820]">
                        {post.importanceScore ?? '—'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Content */}
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-3xl">
              <div className="flex items-start justify-between mb-4">
                <h1 className="text-[28px] font-bold text-black flex-1">
                  {currentPost.title}
                </h1>
                <span className="bg-[#c8991a] text-[#c8991a] text-xs font-semibold rounded px-2 py-1 ml-4">
                  精选推文 {String(currentIndex + 1).padStart(2, "0")}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[12.5px] text-[#888888] mb-6">
                <div className="w-5 h-5 rounded-full bg-gray-300" />
                <span>{currentPost.source.name}</span>
                <span>·</span>
                <span>{currentPost.publishedAt}</span>
                <span>·</span>
                <span>{currentPost.category}</span>
              </div>

              <p className="text-sm text-[#6b6b6b] mb-6">
                {currentPost.summary}
              </p>

              {/* Original Text */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-[#1a1a1a]">
                    推文原文
                  </h3>
                  <a
                    href={currentPost.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#aaaaaa] hover:text-[#101828]"
                  >
                    访问原文地址 →
                  </a>
                </div>
                <div className="bg-[#fafafa] rounded-[14px] p-4 text-sm text-[#000000]">
                  {currentPost.originalText}
                </div>
              </div>

              {/* AI Comment */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">⭐</span>
                  <h3 className="text-sm font-semibold text-[#1a1a1a]">
                    AI 点评
                  </h3>
                </div>
                <div className="border border-[#d4a420] rounded-[14px] p-4 text-sm text-[#2a2a2a]">
                  <p className="mb-4">
                    这是一条重要的推文，代表了该领域的最新进展。
                  </p>
                  <div className="text-[52px] text-[#d4a420] leading-none opacity-20">
                    "
                  </div>
                </div>
              </div>

              {/* Relation */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">💡</span>
                  <h3 className="text-sm font-semibold text-[#1a1a1a]">
                    和我的关系
                  </h3>
                </div>
                <div className="border border-[#4a7feb] rounded-[14px] p-4 text-sm text-[#2a2a2a]">
                  <p>
                    这条推文对你可能有帮助，建议关注。
                  </p>
                  <div className="text-[52px] text-[#4a7feb] leading-none opacity-20">
                    "
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="bg-white border-t border-[#e5e5e5] px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#bbbbbb] hover:text-[#101828] disabled:opacity-50 transition-colors"
          >
            <span>←</span>
            上一篇
          </button>

          <div className="flex gap-1">
            {posts.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-5 h-1.5 rounded-full transition-colors ${
                  idx === currentIndex ? "bg-[#c8991a]" : "bg-[#e5e5e5]"
                }`}
              />
            ))}
          </div>

          <button
            onClick={() =>
              setCurrentIndex(Math.min(posts.length - 1, currentIndex + 1))
            }
            disabled={currentIndex === posts.length - 1}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#111111] hover:text-[#101828] disabled:opacity-50 transition-colors"
          >
            下一篇
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
