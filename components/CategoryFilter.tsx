"use client";

import Tooltip from "./Tooltip";

const categories = [
  { value: "all", label: "全部", tooltip: "显示所有分类的内容" },
  { value: "Model Update", label: "模型更新", tooltip: "AI 模型的最新更新和发布" },
  { value: "Product Update", label: "产品发布", tooltip: "新产品和功能发布" },
  { value: "Research", label: "研究进展", tooltip: "学术研究和技术进展" },
  { value: "Company News", label: "行业动态", tooltip: "行业新闻和公司动态" },
  { value: "Funding", label: "融资", tooltip: "融资轮次和投资信息" },
  { value: "Policy", label: "政策", tooltip: "政策法规和监管动态" },
  { value: "Open Source", label: "开源", tooltip: "开源项目和代码" },
  { value: "Other", label: "其他", tooltip: "其他相关内容" },
];

type CategoryFilterProps = {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
};

export default function CategoryFilter({ activeCategory, onCategoryChange }: CategoryFilterProps) {
  const currentCategory = activeCategory || "all";

  const handleCategoryChange = (category: string) => {
    onCategoryChange(category === "all" ? "" : category);
  };

  return (
    <div className="flex items-center justify-center gap-8 h-14 bg-white overflow-x-auto">
      {categories.map((cat) => (
        <Tooltip key={cat.value} content={cat.tooltip}>
          <button
            onClick={() => handleCategoryChange(cat.value)}
            className={`
              text-sm whitespace-nowrap transition-all duration-200 btn-press font-medium
              ${currentCategory === cat.value
                ? 'text-[#101828]'
                : 'text-[#99a1af] hover:text-[#101828]'
              }
            `}
          >
            {cat.label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
