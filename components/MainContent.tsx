"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { NewsItem } from "@/lib/types";
import type { Task } from "@/lib/task-manager";
import type { User } from "@supabase/supabase-js";
import { useBookmark } from "@/hooks/useBookmark";
import { useSubscription } from "@/hooks/useSubscription";
import SiteHeader from "./SiteHeader";
import RefreshProgress from "./RefreshButton";
import CategoryFilter from "./CategoryFilter";
import FilterPanel from "./FilterPanel";
import NewsList from "./NewsList";
import SourcesList from "./SourcesList";
import FloatingButton from "./FloatingButton";
import WeeklyReportModal from "./WeeklyReportModal";
import AddSourceModal from "./AddSourceModal";
import AuthPromptModal from "./AuthPromptModal";

type Source = {
  id: string;
  handle: string;
  name: string;
  avatar?: string;
  description?: string;
  postCount: number;
  latestPostTime?: string;
  sourceType?: 'blogger' | 'media' | 'academic';
};

type MainContentProps = {
  initialPosts: NewsItem[];
  topImportantNews: NewsItem[];
  sources: Source[];                    // 已订阅信息源列表
  recommendedSources?: Source[];        // 推荐关注的信息源
  totalCount: number;
  stats: {
    bloggerCount: number;
    mediaCount: number;
    academicCount: number;
    totalPosts: number;
    todayPosts: number;
  };
  user: User | null;
  initialBookmarkedIds: string[];
  initialSubscribedSourceIds: string[];
  isPersonalFeed: boolean;              // true = 个性化 feed；false = 推荐 feed
};

export default function MainContent({
  initialPosts,
  topImportantNews,
  sources,
  recommendedSources = [],
  stats,
  user,
  initialBookmarkedIds,
  initialSubscribedSourceIds,
  isPersonalFeed,
}: MainContentProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [isSourcesListCollapsed, setIsSourcesListCollapsed] = useState(false);
  const [activeSourceTab, setActiveSourceTab] = useState<'blogger' | 'media' | 'academic'>('blogger');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [activeSource, setActiveSource] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [posts] = useState<NewsItem[]>(initialPosts);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  const handleNeedAuth = useCallback(() => setShowAuthPrompt(true), []);

  // 收藏功能（乐观更新）
  const { bookmarkedIds, toggleBookmark } = useBookmark(
    new Set(initialBookmarkedIds),
    user,
    handleNeedAuth
  );

  // 订阅功能（乐观更新 + router.refresh 刷新 feed）
  const { subscribedIds, toggleSubscription } = useSubscription(
    new Set(initialSubscribedSourceIds),
    user,
    handleNeedAuth
  );

  const isRunning = !!(task && (task.status === 'pending' || task.status === 'running'));

  const handleRefresh = async () => {
    if (taskId) return;
    if (!user) { setShowAuthPrompt(true); return; }
    try {
      sessionStorage.setItem('lastFetchTimestamp', Date.now().toString());
      sessionStorage.setItem('hasRefreshed', 'false');
      const response = await fetch("/api/refresh", { method: "POST", cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) {
        alert(result.error || "启动抓取任务失败");
        return;
      }
      setTaskId(result.taskId);
    } catch {
      alert("网络请求失败，请检查网络连接后重试");
    }
  };

  const handleTaskUpdate = useCallback((updatedTask: Task | null) => {
    setTask(updatedTask);
  }, []);

  const handleTaskComplete = useCallback(() => {
    setTaskId(null);
    setTask(null);
  }, []);

  const handleAddSource = useCallback((type: 'blogger' | 'media' | 'academic') => {
    if (!user) { setShowAuthPrompt(true); return; }
    setShowAddSourceModal(true);
    setIsSourcesListCollapsed(false);
    setActiveSourceTab(type);
  }, [user]);

  // 计算 sidebar 宽度
  const sidebarWidth = isSourcesListCollapsed ? 100 : 320;

  // 在客户端进行筛选（纯内存操作，无服务端请求）
  const filteredPosts = useMemo(() => {
    let result = posts;

    if (activeCategory && activeCategory !== "all") {
      result = result.filter((post) => post.category === activeCategory);
    }

    if (activeSource && activeSource.trim() !== "") {
      result = result.filter((post) => {
        const handle = typeof post.source === "string" ? post.source : post.source?.handle;
        return handle && handle.toLowerCase() === activeSource.toLowerCase();
      });
    }

    if (searchQuery && searchQuery.trim() !== "") {
      const lowerQuery = searchQuery.toLowerCase().trim();
      result = result.filter((post) => {
        return (
          post.title.toLowerCase().includes(lowerQuery) ||
          post.summary.toLowerCase().includes(lowerQuery) ||
          post.content.toLowerCase().includes(lowerQuery)
        );
      });
    }

    return [...result].sort((a, b) => {
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
  }, [posts, activeCategory, activeSource, searchQuery]);

  return (
    <div className="flex min-h-screen bg-white">
      {/* 左侧信息源列表（已订阅 + 推荐） */}
      <SourcesList
        sources={sources}
        recommendedSources={recommendedSources}
        currentSource={activeSource}
        onSourceSelect={(handle) => setActiveSource(handle || "")}
        onAddSource={() => setShowAddSourceModal(true)}
        subscribedIds={subscribedIds}
        onToggleSubscription={toggleSubscription}
      />

      {/* 中间主内容区 */}
      <div className="flex-1 min-w-0 bg-white">
        <SiteHeader stats={stats} onRefresh={handleRefresh} isRunning={isRunning} onAddSource={handleAddSource} />
        <RefreshProgress
          taskId={taskId}
          task={task}
          onTaskUpdate={handleTaskUpdate}
          onTaskComplete={handleTaskComplete}
        />
        <div className="w-full flex justify-center">
          <div
            className="h-px max-w-[900px] w-full"
            style={{
              margin: '30px 0',
              background: 'linear-gradient(to right, transparent, rgba(229, 231, 235, 0.3) 10%, rgba(229, 231, 235, 0.3) 90%, transparent)'
            }}
          />
        </div>

        {/* 未登录 / 无订阅时的引导 banner */}
        {!isPersonalFeed && (
          <div className="max-w-[900px] mx-auto px-6 mb-4">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#f9fafb] border border-[#f3f4f6] text-sm text-[#6a7282]">
              <span className="text-base">📡</span>
              <span>
                {user
                  ? '关注左侧信息源后，首页将只显示你关注的内容。以下为精选推荐文章：'
                  : '以下为精选推荐文章。登录并关注信息源后，即可获取专属 Feed：'
                }
              </span>
            </div>
          </div>
        )}

        <div style={{ marginTop: isPersonalFeed ? '50px' : '0' }}>
          {/* sticky 行：CategoryFilter */}
          <div className="sticky top-0 z-10 bg-transparent flex justify-center w-full">
            <div className="max-w-[800px] w-full bg-white">
              <CategoryFilter
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
              />
            </div>
          </div>

          {/* FilterPanel 和 NewsList 并列 */}
          <div className="flex justify-center">
            <div style={{ position: 'relative', maxWidth: '896px', width: '100%' }}>
              {/* FilterPanel sticky 定位在左侧 */}
              <div style={{
                position: 'sticky',
                top: '140px',
                width: '220px',
                marginLeft: '-200px',
                paddingRight: '16px',
                zIndex: 9,
                height: 0,
                overflow: 'visible',
              }}>
                <FilterPanel
                  sources={sources}
                  activeCategory={activeCategory}
                  activeSource={activeSource}
                  onClearCategory={() => setActiveCategory("")}
                  onClearSource={() => setActiveSource("")}
                  onClearAll={() => { setActiveCategory(""); setActiveSource(""); }}
                />
              </div>

              {/* 推文模块居中 */}
              <div className="bg-white px-6 pt-4 pb-10 min-h-screen">
                <NewsList
                  posts={filteredPosts}
                  sources={sources}
                  bookmarkedIds={bookmarkedIds}
                  onBookmarkToggle={toggleBookmark}
                  subscribedIds={subscribedIds}
                  onSubscriptionToggle={toggleSubscription}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧悬浮按钮 */}
      {topImportantNews.length > 0 && (
        <>
          <FloatingButton onClick={() => setIsModalOpen(true)} />
          <WeeklyReportModal
            posts={topImportantNews}
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
          />
        </>
      )}

      {/* 添加信息源弹窗 */}
      <AddSourceModal isOpen={showAddSourceModal} onClose={() => setShowAddSourceModal(false)} sidebarWidth={sidebarWidth} />

      {/* 登录提示弹窗（未登录用户触发写操作时显示） */}
      <AuthPromptModal isOpen={showAuthPrompt} onClose={() => setShowAuthPrompt(false)} />
    </div>
  );
}
