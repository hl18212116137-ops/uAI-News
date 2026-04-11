"use client";

import { useRef, useCallback, useLayoutEffect, useState, useEffect } from "react";
import Tooltip from "./Tooltip";
import { FeedFetchGlyph } from "@/components/feed-inline-icons";

const categories = [
  { value: "all", label: "全部", tooltip: "显示全部分类" },
  { value: "Company News", label: "行业", tooltip: "行业与公司动态" },
  { value: "Funding", label: "融资", tooltip: "融资与交易" },
  { value: "Policy", label: "政策", tooltip: "政策与监管" },
  { value: "Research", label: "研究", tooltip: "研究与论文突破" },
  { value: "Model Update", label: "模型", tooltip: "模型更新与发布" },
];

type CategoryFilterProps = {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  onFetch?: () => void;
  /** true：Fetch 按钮显示 FETCHING 且图标旋转（仍可点击以暂停） */
  isFetchRunning?: boolean;
};

type UnderlineState = { left: number; width: number; visible: boolean };

/** Figma 37:4720–4739：Tab 内行（外层 37:4718/4719 由 MainContent 承接） */
export default function CategoryFilter({
  activeCategory,
  onCategoryChange,
  onFetch,
  isFetchRunning = false,
}: CategoryFilterProps) {
  const currentCategory = activeCategory || "all";
  const trackRef = useRef<HTMLDivElement>(null);
  const [underline, setUnderline] = useState<UnderlineState>({
    left: 0,
    width: 0,
    visible: false,
  });

  const updateUnderline = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const btn = track.querySelector<HTMLButtonElement>(
      `[data-category-tab="${CSS.escape(currentCategory)}"]`
    );
    if (!btn) {
      setUnderline((u) => (u.visible ? { left: 0, width: 0, visible: false } : u));
      return;
    }
    setUnderline({
      left: btn.offsetLeft,
      width: btn.offsetWidth,
      visible: true,
    });
  }, [currentCategory]);

  useLayoutEffect(() => {
    updateUnderline();
    const id = requestAnimationFrame(() => updateUnderline());
    return () => cancelAnimationFrame(id);
  }, [updateUnderline]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(() => updateUnderline());
    ro.observe(track);
    window.addEventListener("resize", updateUnderline);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateUnderline);
    };
  }, [updateUnderline]);

  const handleCategoryChange = (category: string) => {
    onCategoryChange(category === "all" ? "" : category);
  };

  return (
    <div
      data-name="Container"
      data-node-id="37:4720"
      className="relative box-border h-[45.39px] min-h-[45.39px] w-full max-w-full shrink-0 bg-white"
    >
      {/*
        Figma layout_QMSJT4：mode none、fill×45.39；Nav layout_14PZ34 绝对定位 x:0 y:8；
        Button:margin layout_KFS385：h:42、pb:10、hug 宽、靠右（稿面 x≈622）。
      */}
      <nav
        data-name="Nav"
        data-node-id="37:4721"
        className="absolute left-0 top-[8px] z-0 max-w-[calc(100%-6.5rem)] min-w-0 overflow-x-auto pb-px [-ms-overflow-style:none] [scrollbar-width:thin]"
        aria-label="分类筛选"
      >
        <div
          ref={trackRef}
          className="relative flex min-w-0 items-end gap-6 pb-px"
        >
          <span
            className="motion-layout-metrics pointer-events-none absolute bottom-0 z-[1] h-0.5 bg-[#05f]"
            style={{
              left: underline.left,
              width: underline.width,
              opacity: underline.visible ? 1 : 0,
            }}
            aria-hidden
          />
          {categories.map((cat) => {
            const active = currentCategory === cat.value;
            return (
              <Tooltip key={cat.value} content={cat.tooltip}>
                <button
                  type="button"
                  data-category-tab={cat.value}
                  onClick={() => handleCategoryChange(cat.value)}
                  className={[
                    "btn-press motion-layout-ease relative z-[2] shrink-0 border-b-2 border-transparent pb-3 font-sans text-[14px] leading-[22.4px] tracking-[-0.35px] transition-colors",
                    active
                      ? "font-bold text-[#05f]"
                      : "font-medium text-[#8a8f98] hover:text-[#111113]",
                  ].join(" ")}
                >
                  {cat.label}
                </button>
              </Tooltip>
            );
          })}
        </div>
      </nav>
      {onFetch ? (
        <div
          data-name="Button:margin"
          data-node-id="37:4734"
          className="absolute right-0 top-0 z-10 flex h-[42px] shrink-0 flex-col justify-start pb-[10px]"
        >
          {/*
            Figma layout_G7RWES：row、items-center、gap:8、padding 0 14、h:32、radius 4、stroke #EBEBEF 1px、effect_A2YT2S 阴影
          */}
          <button
            type="button"
            data-name="Button"
            data-node-id="37:4735"
            onClick={onFetch}
            aria-busy={isFetchRunning}
            aria-label={isFetchRunning ? "暂停抓取" : "抓取更新"}
            className="motion-layout-ease inline-flex h-8 max-h-8 min-h-8 shrink-0 items-center gap-2 rounded-[4px] border border-[#ebebef] bg-white px-[14px] py-0 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] transition-opacity hover:opacity-90"
          >
            <span
              className={[
                "relative h-[12.42px] w-[12.53px] shrink-0 text-[#0055FF]",
                isFetchRunning ? "animate-spin" : "",
              ].join(" ")}
              data-node-id="37:4736"
            >
              <FeedFetchGlyph className="absolute inset-0 block size-full max-w-none" aria-hidden />
            </span>
            <span
              className="font-sans text-[11px] font-semibold uppercase leading-[11px] tracking-[1.1px] text-[#05f]"
              data-node-id="37:4739"
            >
              {isFetchRunning ? "抓取中" : "抓取"}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
