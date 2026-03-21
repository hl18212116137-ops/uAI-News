"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  sources: Source[];
  currentSource?: string;
  totalCount: number;
  onSourceSelect: (handle?: string) => void;
  onSourceDelete?: (handle: string) => void;
};

export default function SourcesList({ sources, currentSource, totalCount, onSourceSelect, onSourceDelete }: SourcesListProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<{ id: string; name: string } | null>(null);
  const [hoveredSourceId, setHoveredSourceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'blogger' | 'media' | 'academic'>('blogger');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const router = useRouter();

  const isActive = (handle?: string) => {
    if (!handle && !currentSource) return true;
    return handle === currentSource;
  };

  const handleDeleteClick = (id: string, name: string) => {
    setSourceToDelete({ id, name });
    setShowConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!sourceToDelete) return;

    setDeletingId(sourceToDelete.id);
    setShowConfirm(false);

    try {
      const response = await fetch(`/api/sources?id=${sourceToDelete.id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        const deletedSource = sources.find(s => s.id === sourceToDelete.id);
        if (deletedSource) {
          onSourceDelete?.(deletedSource.handle);
        }
        router.refresh();
      } else {
        alert(`删除失败: ${result.error}`);
      }
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败，请稍后重试');
    } finally {
      setDeletingId(null);
      setSourceToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setShowConfirm(false);
    setSourceToDelete(null);
  };

  return (
    <div
      className={`
        ${isCollapsed ? 'w-[80px]' : 'w-[319px]'}
        h-screen sticky top-0 overflow-y-auto overflow-x-hidden
        ${isCollapsed ? 'px-[22px] py-5' : 'p-5'}
        bg-white
        transition-all duration-200 ease-in-out
      `}
      style={{ borderRight: isCollapsed ? 'none' : '1px solid #e5e7eb', paddingRight: isCollapsed ? '22px' : 'calc(20px - 1px)' }}
    >
      {/* 折叠/展开按钮 */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="fixed top-1/2 -translate-y-1/2 w-7 h-7 bg-white rounded-full border border-[#e5e7eb] flex items-center justify-center shadow-sm z-10 cursor-pointer hover:bg-gray-50 transition-colors"
        style={{ left: isCollapsed ? 'calc(80px + 8px)' : 'calc(319px + 8px)' }}
        title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
        aria-label={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
      >
        <span className="text-[#6a7282] flex-shrink-0" style={{ width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>{isCollapsed ? '›' : '‹'}</span>
      </button>

      {/* 收拢态：显示头像缩略图 */}
      {isCollapsed && (
        <div className="flex flex-col items-center gap-4 overflow-y-auto h-full justify-center">
          {sources.slice(0, 7).map((source) => (
            <button
              key={source.handle}
              onClick={() => { onSourceSelect(source.handle); setIsCollapsed(false); }}
              title={source.name}
              className={`w-9 h-9 rounded-full flex-shrink-0 overflow-hidden transition-all duration-200 ${
                isActive(source.handle) ? 'ring-2 ring-[#101828]' : 'hover:ring-2 hover:ring-[#e5e7eb]'
              }`}
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

      {/* 内容区域 - 折叠时隐藏 */}
      {!isCollapsed && (
        <div className="mt-[60px] flex flex-col gap-[10px]">
          {/* 标题区域 */}
          <div className="flex items-center justify-between mb-4 pl-[14px]">
            <h2 className="text-lg font-semibold text-[#101828]">已关注信息源</h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="w-6 h-6 bg-[#101828] rounded-full flex items-center justify-center text-white hover:bg-[#1a1f2e] transition-colors"
              title="添加信息源"
            >
              <span className="text-lg leading-none">+</span>
            </button>
          </div>

          {/* 标签页切换 */}
          <div className="flex border-b border-[#e5e7eb] mb-4 -ml-[14px] pl-[14px]">
            <div className="flex flex-1">
              <button
                onClick={() => setActiveTab('blogger')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'blogger'
                    ? 'text-[#101828] border-b-2 border-[#99a1af]'
                    : 'text-[#99a1af] hover:text-[#101828]'
                }`}
              >
                博主
              </button>
              <button
                onClick={() => setActiveTab('media')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'media'
                    ? 'text-[#101828] border-b-2 border-[#99a1af]'
                    : 'text-[#99a1af] hover:text-[#101828]'
                }`}
              >
                媒体
              </button>
              <button
                onClick={() => setActiveTab('academic')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'academic'
                    ? 'text-[#101828] border-b-2 border-[#99a1af]'
                    : 'text-[#99a1af] hover:text-[#101828]'
                }`}
              >
                学术
              </button>
            </div>
          </div>

          {/* 搜索框 */}
          <div className="mb-4 relative pl-[14px] pr-[14px]">
            <input
              type="text"
              placeholder="搜索关注列表"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-3 py-2 text-xs bg-[#f9fafb] rounded-full placeholder-[#99a1af] focus:outline-none focus:ring-2 focus:ring-[#101828] transition-all duration-200"
            />
          </div>

          {/* 各个数据源卡片 */}
          <div className="flex flex-col gap-[10px]">
            {sources
              .filter(s => s.sourceType === activeTab)
              .filter(s => {
                if (!searchQuery) return true;
                const query = searchQuery.toLowerCase();
                return (
                  s.name.toLowerCase().includes(query) ||
                  s.handle.toLowerCase().includes(query) ||
                  (s.description && s.description.toLowerCase().includes(query))
                );
              })
              .map((source) => (
              <Tooltip key={source.handle} content="点击查看作者推文">
                <div
                  onClick={() => onSourceSelect(source.handle)}
                  onMouseEnter={() => setHoveredSourceId(source.id)}
                  onMouseLeave={() => setHoveredSourceId(null)}
                  className={`
                    relative h-[115px] pt-[14px] pl-[14px] pr-[14px] rounded-[10px] cursor-pointer transition-all duration-200 bg-white
                    ${isActive(source.handle)
                      ? 'bg-white'
                      : 'hover:bg-[#f9fafb]'
                    }
                  `}
                >
                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClick(source.id, source.name);
                    }}
                    disabled={deletingId === source.id}
                    className={`
                      absolute top-2 right-2 w-6 h-6
                      border-none rounded
                      ${deletingId === source.id ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600 cursor-pointer'}
                      text-white text-sm
                      flex items-center justify-center
                      transition-opacity duration-200
                      ${hoveredSourceId === source.id || deletingId === source.id ? 'opacity-100' : 'opacity-0'}
                    `}
                    title="取消关注"
                  >
                    {deletingId === source.id ? '...' : '×'}
                  </button>

                  <div className="flex items-start gap-3 h-[87px]">
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
                    <div className="flex-1 min-w-0 flex flex-col h-[87px]">
                      <div className="flex items-center justify-between gap-2 h-[20px]">
                        <span className="font-semibold text-sm text-[#101828] truncate leading-[20px]">{source.name}</span>
                        <span className="text-xs text-[#6a7282] flex-shrink-0 leading-[16px] ml-2">{source.postCount}</span>
                      </div>
                      <div className="text-xs text-[#99a1af] h-[16px] leading-[16px]">@{source.handle}</div>
                      {source.description && (
                        <div className="text-xs text-[#6a7282] line-clamp-2 h-[39px] leading-[19.5px]">
                          {source.description}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Tooltip>
          ))}
          </div>
        </div>
      )}

      {/* 确认删除对话框 */}
      {showConfirm && sourceToDelete && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] animate-fade-in"
          onClick={handleCancelDelete}
        >
          <div
            className="bg-white p-6 rounded-md max-w-md shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="m-0 mb-4 text-lg font-semibold text-[#101828]">
              确认取消关注
            </h3>
            <p className="m-0 mb-6 text-[#6a7282] text-sm">
              确定要取消关注 <strong>{sourceToDelete.name}</strong> 吗?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 bg-gray-100 rounded-md cursor-pointer text-sm hover:bg-gray-200 transition-all duration-200"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-md cursor-pointer text-sm font-medium hover:bg-red-600 transition-all duration-200"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 添加信息源弹窗 */}
      <AddSourceModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
