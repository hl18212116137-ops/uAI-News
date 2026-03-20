"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { NewsItem } from "@/lib/types";
import SiteHeader from "./SiteHeader";
import RefreshProgress from "./RefreshButton";
import CategoryFilter from "./CategoryFilter";
import FilterPanel from "./FilterPanel";
import NewsList from "./NewsList";
import SourcesList from "./SourcesList";
import FloatingButton from "./FloatingButton";
import WeeklyReportModal from "./WeeklyReportModal";
import AddSourceModal from "./AddSourceModal";

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

type Task = {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  error?: string;
  remainingTime?: number;
};

type MainContentProps = {
  initialPosts: NewsItem[];
  topImportantNews: NewsItem[];
  sources: Source[];
  totalCount: number;
  stats: {
    bloggerCount: number;
    mediaCount: number;
    academicCount: number;
    totalPosts: number;
    todayPosts: number;
  };
};

export default function MainContent({ initialPosts, topImportantNews, sources, totalCount, stats }: MainContentProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [isSourcesListCollapsed, setIsSourcesListCollapsed] = useState(false);
  const [activeSourceTab, setActiveSourceTab] = useState<'blogger' | 'media' | 'academic'>('blogger');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const newsListRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  const isRunning = !!(task && (task.status === 'pending' || task.status === 'running'));

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasRefreshed = sessionStorage.getItem('hasRefreshed');
      if (hasRefreshed === 'false') {
        setTimeout(() => {
          sessionStorage.setItem('hasRefreshed', 'true');
        }, 100);
      }
    }
  }, []);

  const handleRefresh = async () => {
    if (taskId) return;
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
    setShowAddSourceModal(true);
    setIsSourcesListCollapsed(false);
    setActiveSourceTab(type);
  }, []);

  const sortedSources = useMemo(() => {
    return [...sources].sort((a, b) => {
      if (!a.latestPostTime && !b.latestPostTime) return 0;
      if (!a.latestPostTime) return 1;
      if (!b.latestPostTime) return -1;
      return new Date(b.latestPostTime).getTime() - new Date(a.latestPostTime).getTime();
    });
  }, [sources]);

  // 计算 sidebar 宽度
  const sidebarWidth = isSourcesListCollapsed ? 100 : 320;

  // 在客户端进行筛选，避免服务端重新渲染
  const filteredPosts = useMemo(() => {
    let posts = initialPosts;

    // 按分类筛选
    const category = searchParams.get("category");
    if (category && category !== "all") {
      posts = posts.filter((post) => post.category === category);
    }

    // 按作者筛选
    const source = searchParams.get("source");
    if (source && source.trim() !== "") {
      posts = posts.filter((post) => {
        const handle = typeof post.source === "string" ? post.source : post.source?.handle;
        return handle && handle.toLowerCase() === source.toLowerCase();
      });
    }

    // 按搜索关键词筛选
    const query = searchParams.get("query");
    if (query && query.trim() !== "") {
      const lowerQuery = query.toLowerCase().trim();
      posts = posts.filter((post) => {
        return (
          post.title.toLowerCase().includes(lowerQuery) ||
          post.summary.toLowerCase().includes(lowerQuery) ||
          post.content.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // 按发布时间排序
    return [...posts].sort((a, b) => {
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
  }, [initialPosts, searchParams]);

  return (
    <div className="flex min-h-screen bg-white">
      {/* 左侧博主列表 */}
      <SourcesList
        sources={sortedSources}
        totalCount={totalCount}
        onAddSourceClick={() => setShowAddSourceModal(true)}
        isCollapsed={isSourcesListCollapsed}
        onCollapsedChange={setIsSourcesListCollapsed}
        activeTab={activeSourceTab}
        onActiveTabChange={setActiveSourceTab}
        isModalOpen={showAddSourceModal}
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
        <div style={{ marginTop: '50px' }}>
          {/* sticky 行：CategoryFilter */}
          <div className="sticky top-0 z-10 bg-transparent flex justify-center w-full">
            <div className="max-w-[800px] w-full bg-white">
              <CategoryFilter />
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
                <FilterPanel sources={sources} />
              </div>

              {/* 推文模块居中 */}
              <div ref={newsListRef} className="bg-white px-6 pt-4 pb-10 min-h-screen">
                <NewsList posts={filteredPosts} sources={sources} />
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
    </div>
  );
}
