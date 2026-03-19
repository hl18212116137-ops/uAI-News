"use client";

import { useRouter, useSearchParams } from "next/navigation";

const categories = [
  { value: "all", label: "全部" },
  { value: "Model Update", label: "模型更新" },
  { value: "Product Update", label: "产品发布" },
  { value: "Research", label: "研究进展" },
  { value: "Company News", label: "行业动态" },
  { value: "Funding", label: "融资" },
  { value: "Policy", label: "政策" },
  { value: "Open Source", label: "开源" },
  { value: "Other", label: "其他" },
];

export default function CategoryFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentCategory = searchParams.get("category") || "all";

  const handleCategoryChange = (category: string) => {
    const params = new URLSearchParams(searchParams);

    // 设置分类参数
    if (category !== "all") {
      params.set("category", category);
    } else {
      params.delete("category");
    }

    const queryString = params.toString();
    router.push(queryString ? `/?${queryString}` : "/");
  };

  return (
    <div className="flex items-center justify-center gap-8 h-14 bg-white overflow-x-auto">
      {categories.map((cat) => (
        <button
          key={cat.value}
          onClick={() => handleCategoryChange(cat.value)}
          className={`
            text-base whitespace-nowrap transition-all duration-200 btn-press font-medium
            ${currentCategory === cat.value
              ? 'text-[#101828]'
              : 'text-[#99a1af] hover:text-[#101828]'
            }
          `}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
