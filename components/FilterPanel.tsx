"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";

// 分类映射表：英文 value 到中文 label
const categoryMap: Record<string, string> = {
  "Model Update": "模型更新",
  "Product Update": "产品发布",
  "Research": "研究进展",
  "Company News": "行业动态",
  "Funding": "融资",
  "Policy": "政策",
  "Open Source": "开源",
  "Other": "其他",
};

export default function FilterPanel() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [hoveredFilter, setHoveredFilter] = useState<string | null>(null);

  const category = searchParams.get("category");
  const source = searchParams.get("source");

  if (!category && !source) {
    return null;
  }

  const handleClearFilter = (filterType: "category" | "source") => {
    const params = new URLSearchParams(searchParams);
    params.delete(filterType);
    const queryString = params.toString();
    router.push(queryString ? `?${queryString}` : "/");
  };

  const handleClearAll = () => {
    router.push("/");
  };

  // 获取分类的中文名称
  const categoryLabel = category ? categoryMap[category] || category : null;

  return (
    <div className="w-[144px] flex-shrink-0">
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
            className="h-[32px] flex items-center justify-between px-5 py-0 text-[14px] font-normal leading-[20px] text-[#4a5565] hover:text-[#101828] transition-colors rounded hover:bg-[#f9fafb]"
            onMouseEnter={() => setHoveredFilter("category")}
            onMouseLeave={() => setHoveredFilter(null)}
          >
            <span># {categoryLabel}</span>
            {hoveredFilter === "category" && (
              <button
                onClick={() => handleClearFilter("category")}
                className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[#99a1af] hover:text-[#101828] transition-colors"
                title="清除分类筛选"
              >
                ×
              </button>
            )}
          </div>
        )}
        {source && (
          <div
            className="h-[32px] flex items-center justify-between px-5 py-0 text-[14px] font-normal leading-[20px] text-[#4a5565] hover:text-[#101828] transition-colors rounded hover:bg-[#f9fafb]"
            onMouseEnter={() => setHoveredFilter("source")}
            onMouseLeave={() => setHoveredFilter(null)}
          >
            <span># {source}</span>
            {hoveredFilter === "source" && (
              <button
                onClick={() => handleClearFilter("source")}
                className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[#99a1af] hover:text-[#101828] transition-colors"
                title="清除作者筛选"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      {/* 清除筛选按钮 */}
      <button
        onClick={handleClearAll}
        className="mt-6 text-[12px] font-normal leading-[18px] text-[#99a1af] hover:text-[#101828] transition-colors text-left"
      >
        清除筛选
      </button>
    </div>
  );
}
