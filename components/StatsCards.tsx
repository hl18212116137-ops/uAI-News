"use client";

import { useState, useRef } from "react";
import Tooltip from "./Tooltip";

type StatsCardsProps = {
  bloggerCount: number;
  mediaCount: number;
  academicCount: number;
  totalPosts: number;
  todayPosts: number;
  onAddSource?: (type: 'blogger' | 'media' | 'academic') => void;
};

export default function StatsCards({ bloggerCount, mediaCount, academicCount, totalPosts, todayPosts, onAddSource }: StatsCardsProps) {
  const [hoveredStat, setHoveredStat] = useState<string | null>(null);
  const hideTimerRef = useRef<NodeJS.Timeout>();

  const handleMouseEnter = (type: string) => {
    clearTimeout(hideTimerRef.current);
    setHoveredStat(type);
  };

  const handleMouseLeave = () => {
    hideTimerRef.current = setTimeout(() => setHoveredStat(null), 1000);
  };

  const stats = [
    { label: '已关注博主', value: bloggerCount, type: 'blogger' },
    { label: '已关注媒体', value: mediaCount, type: 'media' },
    { label: '已关注学术', value: academicCount, type: 'academic' },
    { label: '已收录推文', value: totalPosts },
    { label: '今日新增', value: todayPosts },
  ];

  const getButtonLabel = (type: string) => {
    const labels: Record<string, string> = {
      'blogger': '+ 添加博主',
      'media': '+ 添加媒体',
      'academic': '+ 添加学术网站',
    };
    return labels[type] || '';
  };

  return (
    <div className="flex justify-center items-center mb-20">
      {stats.map((stat, index) => {
        const isInteractive = stat.type && ['blogger', 'media', 'academic'].includes(stat.type);
        const isHovered = hoveredStat === stat.type;

        return (
          <div key={stat.label} className="flex items-center">
            {(stat.label === '已收录推文' || stat.label === '今日新增') ? (
              <Tooltip content="推文来自已关的信息源">
                <div className="flex flex-col items-center" style={{ paddingLeft: '80px', paddingRight: '80px' }}>
                  <div className="text-[36px] font-bold leading-[40px] text-[#101828] mb-1">
                    {stat.value}
                  </div>
                  <div className="text-[12px] font-normal leading-[15px] text-[#6a7282] whitespace-nowrap">{stat.label}</div>
                </div>
              </Tooltip>
            ) : (
              <div
                className={`relative flex flex-col items-center ${isInteractive ? 'cursor-pointer' : ''}`}
                style={{ paddingLeft: '80px', paddingRight: '80px', minHeight: isInteractive ? '80px' : 'auto' }}
                onMouseEnter={() => isInteractive && handleMouseEnter(stat.type!)}
                onMouseLeave={handleMouseLeave}
              >
                <div className="text-[36px] font-bold leading-[40px] text-[#101828] mb-1">
                  {stat.value}
                </div>
                <div className="text-[12px] font-normal leading-[15px] text-[#6a7282] whitespace-nowrap">{stat.label}</div>

                {/* 悬停弹出按钮 - 始终渲染，通过 opacity 和 pointer-events 控制 */}
                {isInteractive && (
                  <button
                    onClick={() => onAddSource?.(stat.type as 'blogger' | 'media' | 'academic')}
                    className={`absolute top-full mt-2 px-4 h-7 bg-[#101828] text-white text-xs font-medium rounded-full whitespace-nowrap hover:bg-gray-800 transition-colors flex items-center gap-1.5 ${
                      isHovered ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                    }`}
                    style={{ boxShadow: '0px 1px 3px 0px rgba(0,0,0,0.1), 0px 1px 2px 0px rgba(0,0,0,0.1)' }}
                  >
                    {getButtonLabel(stat.type!)}
                  </button>
                )}
              </div>
            )}
            {index < stats.length - 1 && (
              <div className="w-px h-6 bg-[#e5e7eb] flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}
