'use client';

import { useState, useEffect } from 'react';
import Tooltip from './Tooltip';

type StatusIndicatorProps = {
  onRefresh: () => void;
  isRunning: boolean;
};

export default function StatusIndicator({ onRefresh, isRunning }: StatusIndicatorProps) {
  const [lastUpdateText, setLastUpdateText] = useState('--');

  useEffect(() => {
    const update = () => {
      const ts = sessionStorage.getItem('lastFetchTimestamp');
      if (!ts) {
        setLastUpdateText('--');
        return;
      }
      const diff = Math.floor((Date.now() - Number(ts)) / 1000);
      if (diff < 60) {
        setLastUpdateText('刚刚更新');
      } else if (diff < 3600) {
        setLastUpdateText(`${Math.floor(diff / 60)} 分钟前`);
      } else {
        setLastUpdateText(`${Math.floor(diff / 3600)} 小时前`);
      }
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 mb-[55px]">
      {/* 状态 + 上次更新时间行 */}
      <div className="flex items-center mt-3" style={{ gap: '16px' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
          <span className="text-xs text-[#6a7282]">实时更新</span>
        </div>
        <div className="w-px h-3.5 bg-[#e5e7eb]" />
        <span className="text-xs text-[#99a1af]">
          上次更新{' '}
          <span className="text-[#364153] font-semibold">{lastUpdateText}</span>
        </span>
      </div>

      {/* 立即更新按钮 */}
      <Tooltip content="立即抓取最新内容">
        <button
          onClick={onRefresh}
          disabled={isRunning}
          className="bg-[#101828] text-white px-4 h-7 rounded-full text-xs font-medium flex items-center gap-1.5 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-[14px]"
          style={{ boxShadow: '0px 1px 3px 0px rgba(0,0,0,0.1), 0px 1px 2px 0px rgba(0,0,0,0.1)' }}
        >
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isRunning ? '更新中...' : '立即更新'}
        </button>
      </Tooltip>
    </div>
  );
}
