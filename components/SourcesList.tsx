"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import AddSourceModal from "./AddSourceModal";

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
  sources: Source[];
  currentSource?: string;
  totalCount: number;
};

// 对齐标准
const ALIGNMENT = {
  horizontal: 'pl-[14px] pr-[0px]', // 左右对齐基准
  contentGap: 'gap-0', // 内容区域间距
};

export default function SourcesList({ sources, currentSource, totalCount }: SourcesListProps) {
  // 状态管理
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'blogger' | 'media' | 'academic'>('blogger');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isHoveringCollapsed, setIsHoveringCollapsed] = useState(false);

  const router = useRouter();

  // 检查是否为活跃源
  const isActive = (handle?: string) => {
    if (!handle && !currentSource) return true;
    return handle === currentSource;
  };

  // 过滤源列表
  const filteredSources = sources
    .filter(s => s.sourceType === activeTab)
    .filter(s => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(query) ||
        s.handle.toLowerCase().includes(query) ||
        (s.description && s.description.toLowerCase().includes(query))
      );
    });

  return (
    <div
      className={`
        ${isCollapsed ? 'w-[100px]' : 'w-[320px]'}
        h-screen sticky top-0 overflow-hidden
        ${isCollapsed ? 'px-[22px] py-5' : 'px-0 py-5'}
        bg-white
        transition-all duration-200 ease-in-out
      `}
      style={{
        borderRight: isCollapsed ? 'none' : '1px solid #e5e7eb',
        paddingRight: isCollapsed ? '22px' : '0',
      }}
      onMouseEnter={() => isCollapsed && setIsHoveringCollapsed(true)}
      onMouseLeave={() => isCollapsed && setIsHoveringCollapsed(false)}
    >
      {/* 折叠/展开按钮 */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="fixed top-1/2 -translate-y-1/2 w-7 h-7 bg-white rounded-full border border-[#e5e7eb] flex items-center justify-center z-10 cursor-pointer hover:bg-gray-50 transition-all duration-200"
        style={{
          left: isCollapsed ? 'calc(100px - 8px)' : 'calc(320px + 8px)',
          opacity: isCollapsed && !isHoveringCollapsed ? 0 : 1,
          pointerEvents: isCollapsed && !isHoveringCollapsed ? 'none' : 'auto',
        }}
        title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
        aria-label={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
      >
        <span
          className="text-[#6a7282] flex-shrink-0"
          style={{
            width: '14px',
            height: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
          }}
        >
          {isCollapsed ? '›' : '‹'}
        </span>
      </button>

      {/* 折叠态：头像缩略图 */}
      {isCollapsed && (
        <div className="flex flex-col items-center gap-4 overflow-y-auto h-full justify-center" style={{ filter: 'saturate(0.7)' }}>
          {sources.slice(0, 7).map((source) => (
            <button
              key={source.handle}
              onClick={() => {
                router.push(`?source=${source.handle}`);
                setIsCollapsed(false);
              }}
              title={source.name}
              className={`w-9 h-9 rounded-full flex-shrink-0 overflow-hidden transition-all duration-200 hover:ring-2 hover:ring-[#e5e7eb]`}
            >
              {source.avatar ? (
                <img src={source.avatar} alt={source.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-[#6a7282]">
                  {source.name.charAt(0).toUpperCase()}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* 展开态：完整内容 */}
      {!isCollapsed && (
        <div className={`mt-0 flex flex-col ${ALIGNMENT.contentGap} h-screen overflow-hidden`}>
          {/* 固定顶部区域 */}
          <div className="flex-shrink-0">
            {/* 标题区域 */}
            <div className={`flex items-center justify-between mb-6 mt-5 ${ALIGNMENT.horizontal}`}>
              <h2 className="text-xl font-semibold text-[#101828]">已关注信息源</h2>
              <button
                onClick={() => setShowAddModal(true)}
                className="w-7 h-7 bg-[#101828] rounded-full flex items-center justify-center text-white hover:bg-[#1a1f2e] transition-colors flex-shrink-0"
                title="添加信息源"
              >
                <span className="text-lg leading-none">+</span>
              </button>
            </div>

            {/* 标签页切换 */}
            <div className={`flex border-b border-[#f3f4f6] mb-4 ml-[10px] mr-[10px]`}>
              {(['blogger', 'media', 'academic'] as const).map((tab) => (
                <div key={tab} className="relative">
                  <button
                    onClick={() => setActiveTab(tab)}
                    className={`py-2 px-3 text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? 'text-[#101828]'
                        : 'text-[#99a1af] hover:text-[#101828]'
                    }`}
                  >
                    {tab === 'blogger' ? '博主' : tab === 'media' ? '媒体' : '学术'}
                  </button>
                  {activeTab === tab && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#99a1af]" />
                  )}
                </div>
              ))}
            </div>

            {/* 搜索框 */}
            <div className={`mb-4 relative ml-[10px] mr-[10px]`}>
              <input
                type="text"
                placeholder="搜索关注列表"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-4 pr-3 py-2 text-xs bg-[#f9fafb] rounded-full placeholder-[#99a1af] focus:outline-none focus:ring-2 focus:ring-[#101828] transition-all duration-200"
              />
            </div>
          </div>

          {/* 可滚动的源列表 */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="flex flex-col gap-0">
              {filteredSources.map((source) => (
                <div
                  key={source.handle}
                  onClick={() => router.push(`?source=${source.handle}`)}
                  className={`
                    pt-[14px] pb-[14px] pl-[10px] pr-[10px] rounded-[10px] cursor-pointer transition-all duration-200
                    ${isActive(source.handle) ? 'bg-white' : 'hover:bg-[#f9fafb]'}
                  `}
                >
                  <div className="flex items-start gap-3">
                    {/* 头像 */}
                    {source.avatar ? (
                      <img
                        src={source.avatar}
                        alt={source.name}
                        className="w-10 h-10 rounded-full flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                        {source.name.charAt(0).toUpperCase()}
                      </div>
                    )}

                    {/* 内容 */}
                    <div className="flex-1 flex flex-col">
                      {/* 名称 + 数字 */}
                      <div className="flex items-center h-[20px]">
                        <span className="font-semibold text-sm text-[#101828] truncate leading-[20px] flex-1">
                          {source.name}
                        </span>
                        <span className="text-xs text-[#6a7282] flex-shrink-0 leading-[16px]">
                          {source.postCount}
                        </span>
                      </div>

                      {/* Handle */}
                      <div className="text-xs text-[#99a1af] h-[16px] leading-[16px] mt-1">
                        @{source.handle}
                      </div>

                      {/* 描述 */}
                      {source.description && (
                        <div className="text-xs text-[#6a7282] line-clamp-2 leading-[19.5px] mt-2 mr-[-5px] overflow-hidden">
                          {source.description}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 添加信息源弹窗 */}
      <AddSourceModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
