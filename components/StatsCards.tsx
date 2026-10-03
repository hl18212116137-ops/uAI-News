"use client";

import Tooltip from "./Tooltip";
import type { Stats } from "@/lib/stats";

export default function StatsCards({ sourceCount, recentPosts, unavailable = false }: Stats & { unavailable?: boolean }) {
  const items = [
    { label: "信息源", value: sourceCount },
    { label: "近24小时新增", value: recentPosts },
  ];
  return (
    <Tooltip content="统计当前信息源范围；新增按内容入库时间计算。">
      <div className="flex h-full min-w-0 items-center gap-8" aria-label="资讯统计">
        {items.map((item, index) => <div key={item.label} className={`min-w-0 ${index ? "border-l border-[#f3f4f6] pl-8" : ""}`}>
          <span className="block pb-2 font-sans text-[12px] font-bold leading-[18px] tracking-[0.04em] text-[#8a8a93]">{item.label}</span>
          <span className={`block font-sans text-[15px] font-bold leading-[15px] tabular-nums ${index && item.value > 0 ? "text-[#05f]" : "text-[#111113]"}`}>
            {unavailable ? "—" : item.value.toLocaleString("zh-CN")}
          </span>
        </div>)}
      </div>
    </Tooltip>
  );
}
