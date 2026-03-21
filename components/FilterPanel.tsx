"use client";

import { useState } from "react";
import Tooltip from "./Tooltip";
import { CATEGORY_ZH_MAP } from "@/lib/types";

type Source = {
  handle: string;
  name: string;
};

type FilterPanelProps = {
  sources?: Source[];
  activeCategory: string;
  activeSource: string;
  onClearCategory: () => void;
  onClearSource: () => void;
  onClearAll: () => void;
};

export default function FilterPanel({
  sources = [],
  activeCategory,
  activeSource,
  onClearCategory,
  onClearSource,
  onClearAll,
}: FilterPanelProps) {
  const [hoveredFilter, setHoveredFilter] = useState<string | null>(null);

  if (!activeCategory && !activeSource) {
    return null;
  }

  // 获取分类的中文名称
  const categoryLabel = activeCategory ? CATEGORY_ZH_MAP[activeCategory as keyof typeof CATEGORY_ZH_MAP] || activeCategory : null;

  // 获取作者的名字
  const sourceInfo = activeSource ? sources.find(s => s.handle === activeSource) : null;
  const sourceName = sourceInfo?.name || activeSource;

  return (
    <div className="w-[180px] flex-shrink-0">
      {/* 标题 */}
      <div className="h-[24px] mb-5">
        <p className="text-[14px] font-medium leading-[20px] text-[#99a1af]">
          筛选
        </p>
      </div>

      {/* 筛选项容器 */}
      <div className="flex flex-col gap-3">
        {categoryLabel && (
          <div
            className="h-[32px] flex items-center justify-between px-4 py-0 text-[14px] font-normal leading-[20px] text-[#101828] hover:text-[#101828] transition-colors rounded hover:bg-[#f9fafb]"
            onMouseEnter={() => setHoveredFilter("category")}
            onMouseLeave={() => setHoveredFilter(null)}
          >
            <span># {categoryLabel}</span>
            {hoveredFilter === "category" && (
              <button
                onClick={onClearCategory}
                className="flex-shrink-0 flex items-center justify-center text-[#99a1af] hover:text-[#101828] transition-colors text-[12px] leading-none"
                title="清除分类筛选"
              >
                ×
              </button>
            )}
          </div>
        )}
        {activeSource && (
          <div
            className="h-[32px] flex items-center justify-between px-4 py-0 text-[14px] font-normal leading-[20px] text-[#101828] hover:text-[#101828] transition-colors rounded hover:bg-[#f9fafb]"
            onMouseEnter={() => setHoveredFilter("source")}
            onMouseLeave={() => setHoveredFilter(null)}
          >
            <span># {sourceName}</span>
            {hoveredFilter === "source" && (
              <button
                onClick={onClearSource}
                className="flex-shrink-0 flex items-center justify-center text-[#99a1af] hover:text-[#101828] transition-colors text-[12px] leading-none"
                title="清除作者筛选"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      {/* 清除筛选按钮 */}
      <Tooltip content="清除所有筛选条件">
        <button
          onClick={onClearAll}
          className="mt-6 text-[12px] font-normal leading-[18px] text-[#99a1af] hover:text-[#101828] transition-colors text-left"
        >
          清除筛选
        </button>
      </Tooltip>
    </div>
  );
}
