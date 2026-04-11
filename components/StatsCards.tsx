"use client";

import Tooltip from "./Tooltip";

type StatsCardsProps = {
  bloggerCount: number;
  mediaCount: number;
  academicCount: number;
  totalPosts: number;
  todayPosts: number;
};

/**
 * Figma 37:4690–4717：标签在上、数值在下；竖线 #f1f1f1 h-24；TODAY 数值 #05f
 */
export default function StatsCards({
  bloggerCount,
  mediaCount,
  academicCount,
  totalPosts,
  todayPosts,
}: StatsCardsProps) {
  const sourcesTotal = bloggerCount + academicCount;
  const collectionsTotal = mediaCount;
  const indexed = totalPosts.toLocaleString("zh-CN");
  const todayStr = todayPosts > 0 ? `+${todayPosts}` : String(todayPosts);
  const todayBlue = todayPosts > 0;

  const items = [
    {
      value: String(sourcesTotal),
      label: "信息源",
      blue: false,
      pad: "" as const,
      width: "w-[139.25px]",
      nodeId: "37:4691",
    },
    {
      value: String(collectionsTotal),
      label: "专题",
      blue: false,
      pad: "px-8" as const,
      width: "w-[203.25px]",
      nodeId: "37:4698",
    },
    {
      value: indexed,
      label: "近30天收录",
      blue: false,
      pad: "px-8" as const,
      width: "w-[203.25px]",
      nodeId: "37:4705",
    },
    {
      value: todayStr,
      label: "今日",
      blue: todayBlue,
      pad: "pl-8" as const,
      width: "w-[171.25px]",
      nodeId: "37:4712",
    },
  ];

  return (
    <div
      data-name="Stats container"
      className="mb-0 flex h-full min-h-0 w-full min-w-0 flex-col overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:thin]"
    >
      <Tooltip content="数值与当前订阅及本页展示的动态一致。">
        <div
          data-name="Stats row"
          className="flex h-full min-h-0 w-full min-w-[460px] flex-nowrap items-center justify-start"
        >
          {items.map((item, i) => (
            <div key={item.label} className="flex shrink-0 items-stretch">
              <div
                data-name="Container"
                data-node-id={item.nodeId}
                className={`flex min-w-0 flex-col items-start ${item.width} ${item.pad}`}
              >
                <div className="w-full pb-2">
                  <span className="block font-sans text-[10px] font-bold uppercase leading-[10px] tracking-[0.5px] text-[#8a8a93]">
                    {item.label}
                  </span>
                </div>
                <div className="w-full">
                  <span
                    className={[
                      "block font-mono text-[15px] font-bold leading-[15px] tracking-[0.75px]",
                      item.blue ? "text-[#05f]" : "text-[#111113]",
                    ].join(" ")}
                  >
                    {item.value}
                  </span>
                </div>
              </div>
              {i < items.length - 1 ? (
                <div
                  className="app-divider-v mx-0 h-6 self-center"
                  data-name="Vertical Divider"
                  aria-hidden
                />
              ) : null}
            </div>
          ))}
        </div>
      </Tooltip>
    </div>
  );
}
