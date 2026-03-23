"use client";

import { useState } from "react";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import AddSourceModal from "./AddSourceModal";
import Tooltip from "./Tooltip";

type Source = {
  handle: string;
  name: string;
  avatar?: string;
  description?: string;
  postCount: number;
  latestPostTime?: string;
  id: string;
  sourceType?: 'blogger' | 'media' | 'academic';
};

type SourcesListProps = {
  sources: Source[];              // 已订阅的信息源
  recommendedSources?: Source[];  // 推荐关注的信息源（未订阅）
  currentSource?: string;
  onSourceSelect: (handle?: string) => void;
  onAddSource?: () => void;
  subscribedIds?: Set<string>;
  onToggleSubscription?: (sourceId: string, sourceHandle: string) => void;
  user: User | null;              // 当前用户
  isCollapsed: boolean;            // 受控状态：是否折叠
  onToggleCollapse: () => void;    // 切换折叠状态的回调
};

export default function SourcesList({
  sources,
  recommendedSources = [],
  currentSource,
  onSourceSelect,
  onAddSource,
  subscribedIds = new Set(),
  onToggleSubscription,
  user,
  isCollapsed,
  onToggleCollapse,
}: SourcesListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isRefreshingRecommended, setIsRefreshingRecommended] = useState(false);
  const [displayedRecommended, setDisplayedRecommended] = useState<Source[]>(recommendedSources);

  const handleRefreshRecommended = async () => {
    setIsRefreshingRecommended(true);
    try {
      const response = await fetch('/api/recommended-sources?limit=3');
      const data = await response.json();
      if (data.success) {
        setDisplayedRecommended(data.sources);
      }
    } catch (error) {
      console.error('Failed to refresh recommended sources:', error);
    } finally {
      setIsRefreshingRecommended(false);
    }
  };

  const isActive = (handle?: string) => {
    if (!handle && !currentSource) return true;
    return handle === currentSource;
  };

  const filteredSubscribed = sources.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.handle.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  });

  const filteredRecommended = displayedRecommended.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.handle.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  });

  const SourceCard = ({
    source,
    isSubscribed,
  }: {
    source: Source;
    isSubscribed: boolean;
  }) => (
    <Tooltip
      content={`点击查看 ${source.name} 的推文`}
      excludeSelector="[data-tooltip-exclude]"
    >
      <div
        onClick={() => onSourceSelect(source.handle)}
        className={`
          relative pt-[14px] pb-[14px] pl-[15px] pr-[12px] rounded-[10px] cursor-pointer transition-all duration-200 bg-white
          ${isActive(source.handle) ? 'bg-white' : 'hover:bg-[#f9fafb]'}
        `}
      >
        <div className="flex items-start gap-3">
          {source.avatar ? (
            <Image
              src={source.avatar}
              alt={source.name}
              width={40}
              height={40}
              className="rounded-full flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-sm font-semibold flex-shrink-0">
              {source.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm text-[#101828] truncate leading-5">{source.name}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Tooltip content="已收录推文数">
                  <span
                    className="text-xs text-[#6a7282] cursor-default"
                    data-tooltip-exclude=""
                  >
                    {source.postCount}
                  </span>
                </Tooltip>
                {/* 订阅/取消按钮 */}
                {onToggleSubscription && (
                  <Tooltip content={isSubscribed ? "取消关注" : "关注此信息源"}>
                    <button
                      data-tooltip-exclude=""
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleSubscription(source.id, source.handle);
                      }}
                      className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
                        isSubscribed
                          ? 'text-[#fb2c36] hover:text-[#99a1af]'
                          : 'text-[#99a1af] hover:text-[#fb2c36]'
                      }`}
                      aria-label={isSubscribed ? "取消关注" : "关注"}
                    >
                      {isSubscribed ? (
                        // 已关注：实心勾
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        // 未关注：加号
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      )}
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
            <div className="text-xs text-[#99a1af] leading-4">@{source.handle}</div>
            {source.description && (
              <div className="text-xs text-[#6a7282] line-clamp-2 leading-[1.5]">
                {source.description}
              </div>
            )}
          </div>
        </div>
      </div>
    </Tooltip>
  );

  return (
    <div
      className={`
        ${isCollapsed ? 'w-[80px]' : 'w-[320px]'}
        h-screen sticky top-0 overflow-y-auto overflow-x-hidden sidebar-scroll
        ${isCollapsed ? 'py-5' : 'pl-[6px] pr-0 py-5'}
        bg-white group
        transition-all duration-200 ease-in-out
      `}
      style={{ borderRight: isCollapsed ? 'none' : '1px solid #e5e7eb' }}
    >
      {/* 折叠/展开按钮 */}
      <button
        onClick={onToggleCollapse}
        className={`fixed top-1/2 -translate-y-1/2 w-7 h-7 bg-white rounded-full border border-[#e5e7eb] flex items-center justify-center z-10 cursor-pointer hover:bg-gray-50 transition-all duration-200 ${
          isCollapsed ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
        }`}
        style={{ left: isCollapsed ? 'calc(80px + 8px)' : 'calc(320px + 8px)' }}
        aria-label={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
      >
        <span className="text-[#6a7282] flex-shrink-0" style={{ width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>{isCollapsed ? '›' : '‹'}</span>
      </button>

      {/* 收拢态：头像网格 */}
      {isCollapsed && (
        <div
          className="flex flex-col items-center gap-4 h-full justify-center cursor-pointer"
          onClick={onToggleCollapse}
        >
          {[...sources, ...recommendedSources].slice(0, 7).map((source) => (
            <div
              key={source.handle}
              title={source.name}
              className={`w-9 h-9 rounded-full flex-shrink-0 overflow-hidden transition-all duration-200 pointer-events-none ${
                isActive(source.handle) ? 'ring-2 ring-[#101828]' : ''
              }`}
            >
              {source.avatar ? (
                <Image src={source.avatar} alt={source.name} width={36} height={36} className="w-full h-full object-cover rounded-full" />
              ) : (
                <div className="w-full h-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-[#6a7282]">
                  {source.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 展开态：完整列表 */}
      {!isCollapsed && (
        <div className="mt-[36px] flex flex-col gap-[10px]">
          {/* 标题区域 */}
          <div className="flex items-center justify-between mb-4 pl-[14px] pr-[14px]">
            <h2 className="text-xl font-semibold text-[#101828]">我的信息源</h2>
            <Tooltip content="添加信息源">
              <button
                onClick={() => onAddSource ? onAddSource() : setShowAddModal(true)}
                className="w-6 h-6 bg-[#101828] rounded-full flex items-center justify-center text-white hover:bg-[#1a1f2e] transition-colors"
              >
                <span className="text-lg leading-none">+</span>
              </button>
            </Tooltip>
          </div>

          {/* 搜索框 */}
          <div className="mb-4 relative pl-[14px] pr-[14px]">
            <input
              type="text"
              placeholder="搜索信息源"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-3 py-2 text-xs bg-[#f9fafb] rounded-full placeholder-[#99a1af] focus:outline-none focus:ring-2 focus:ring-[#101828] transition-all duration-200"
            />
          </div>

          {/* 已关注信息源 */}
          {filteredSubscribed.length > 0 && (
            <div className="flex flex-col gap-[4px]">
              <div className="px-[14px] mb-1">
                <span className="text-xs font-medium text-[#99a1af] uppercase tracking-wide">已关注</span>
              </div>
              {filteredSubscribed.map((source) => (
                <SourceCard key={source.handle} source={source} isSubscribed={subscribedIds.has(source.id)} />
              ))}
            </div>
          )}

          {/* 未关注任何源时的提示（非搜索状态下显示） */}
          {filteredSubscribed.length === 0 && !searchQuery && (
            <div className="px-[14px] py-3 text-center">
              <p className="text-xs text-[#99a1af] leading-relaxed">
                还没有关注任何信息源<br />
                在下方发现并关注感兴趣的博主
              </p>
            </div>
          )}

          {/* 推荐关注 */}
          {filteredRecommended.length > 0 && (
            <div className="flex flex-col gap-[4px] mt-2">
              <div className="px-[14px] mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-[#99a1af] uppercase tracking-wide">推荐关注</span>
                <Tooltip content="换一批推荐">
                  <button
                    onClick={handleRefreshRecommended}
                    disabled={isRefreshingRecommended}
                    className="w-4 h-4 text-[#99a1af] hover:text-[#101828] transition-colors disabled:opacity-50"
                    aria-label="刷新推荐"
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </Tooltip>
              </div>
              {filteredRecommended.map((source) => (
                <SourceCard key={source.handle} source={source} isSubscribed={subscribedIds.has(source.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 添加信息源弹窗 */}
      <AddSourceModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} user={user} />
    </div>
  );
}
