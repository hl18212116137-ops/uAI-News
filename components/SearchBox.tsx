"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

// 搜索关键词最大长度限制
const MAX_QUERY_LENGTH = 100;

export default function SearchBox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.get("query") || "";
  const currentCategory = searchParams.get("category");

  const [inputValue, setInputValue] = useState(currentQuery);

  // 同步 URL 中的 query 参数到输入框
  useEffect(() => {
    setInputValue(currentQuery);
  }, [currentQuery]);

  // 防抖逻辑：500ms 后才更新 URL
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== currentQuery) {
        // 构建新的 URL 参数
        const params = new URLSearchParams();

        // 保留 category 参数
        if (currentCategory) {
          params.set("category", currentCategory);
        }

        // 设置 query 参数
        if (inputValue.trim() !== "") {
          params.set("query", inputValue.trim());
        }

        // 更新 URL
        const queryString = params.toString();
        if (queryString) {
          router.push(`/?${queryString}`);
        } else {
          router.push("/");
        }
      }
    }, 500); // 500ms 防抖延迟

    return () => clearTimeout(timer);
  }, [inputValue, currentQuery, currentCategory, router]);

  const handleInputChange = (value: string) => {
    // 输入验证：限制最大长度
    if (value.length > MAX_QUERY_LENGTH) {
      value = value.slice(0, MAX_QUERY_LENGTH);
    }
    setInputValue(value);
  };

  const handleClear = () => {
    setInputValue("");

    // 构建新的 URL 参数（只保留 category）
    if (currentCategory) {
      router.push(`/?category=${encodeURIComponent(currentCategory)}`);
    } else {
      router.push("/");
    }
  };

  return (
    <div className="mb-5 flex items-center gap-2">
      <label htmlFor="search-input" className="text-sm text-[#6a7282] whitespace-nowrap">
        搜索：
      </label>
      <div className="relative flex-1 max-w-md">
        <input
          id="search-input"
          type="text"
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="搜索标题、摘要或内容..."
          maxLength={MAX_QUERY_LENGTH}
          className="input-field w-full pr-16"
        />
        {inputValue && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-[#6a7282] hover:text-[#101828] hover:bg-gray-200 rounded transition-all duration-200"
            title="清除"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
