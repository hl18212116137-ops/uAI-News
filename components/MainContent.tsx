"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
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
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
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

  // 保存滚动位置，当 URL 参数变化时恢复
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 从 sessionStorage 读取保存的滚动位置
      const savedScrollY = sessionStorage.getItem('scrollY');
      if (savedScrollY) {
        const scrollY = parseInt(savedScrollY, 10);
        // 使用 setTimeout 确保 DOM 已更新
        setTimeout(() => {
          window.scrollTo(0, scrollY);
          sessionStorage.removeItem('scrollY');
        }, 0);
      }
    }
  }, [searchParams, initialPosts]);

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

  const sortedSources = useMemo(() => {
    return [...sources].sort((a, b) => {
      if (!a.latestPostTime && !b.latestPostTime) return 0;
      if (!a.latestPostTime) return 1;
      if (!b.latestPostTime) return -1;
      return new Date(b.latestPostTime).getTime() - new Date(a.latestPostTime).getTime();
    });
  }, [sources]);

  return (
    <div className="flex min-h-screen bg-white">
      {/* 左侧博主列表 */}
      <SourcesList
        sources={sortedSources}
        totalCount={totalCount}
      />

      {/* 中间主内容区 */}
      <div className="flex-1 min-w-0 bg-white">
        <SiteHeader stats={stats} onRefresh={handleRefresh} isRunning={isRunning} />
        <RefreshProgress
          taskId={taskId}
          task={task}
          onTaskUpdate={handleTaskUpdate}
          onTaskComplete={handleTaskComplete}
        />
        <div className="w-full flex justify-center">
          <div className="h-px bg-[#e5e7eb] max-w-[224px] w-full" style={{ margin: '60px 0' }} />
        </div>
        <div style={{ marginTop: '38px' }}>
          <div className="flex justify-center">
            <div className="max-w-[896px] w-full">
              <CategoryFilter />
            </div>
          </div>
          <div className="flex justify-center" style={{ marginTop: '38px' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '896px' }}>
              <div style={{ position: 'absolute', right: '100%', top: 0 }}>
                <FilterPanel sources={sources} />
              </div>
              <div className="bg-white px-6 pt-4 pb-10 min-h-screen">
                <NewsList posts={initialPosts} sources={sources} />
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
    </div>
  );
}
