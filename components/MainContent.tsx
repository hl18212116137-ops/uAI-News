"use client";

import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { NewsItem } from "@/lib/types";
import type { Task } from "@/lib/task-manager";
import type { User } from "@supabase/supabase-js";
import { useBookmark } from "@/hooks/useBookmark";
import { useSubscription } from "@/hooks/useSubscription";
import { useSubscribedFeedSync } from "@/hooks/useSubscribedFeedSync";
import SiteHeader from "./SiteHeader";
import TopBar from "./TopBar";
import RefreshProgress from "./RefreshButton";
import CategoryFilter from "./CategoryFilter";
import FilterPanel from "./FilterPanel";
import NewsList from "./NewsList";
import SourcesList from "./SourcesList";

const AddSourceModal = dynamic(() => import("./AddSourceModal"), { ssr: false });
const AuthPromptModal = dynamic(() => import("./AuthPromptModal"), { ssr: false });
const AnalysisPanel = dynamic(() => import("./AnalysisPanel"), { ssr: false });
import {
  MAIN_FRAME_GRID_SHELL_CLASS,
  MAIN_GRID_COLS_NO_ANALYSIS,
  MAIN_GRID_COLS_WITH_ANALYSIS,
  MAIN_SIDE_FRAME_CLASS,
  VERTICAL_DIVIDER_AFTER_SOURCES_CLASS,
  VERTICAL_DIVIDER_BEFORE_ANALYSIS_CLASS,
} from "@/lib/main-layout-classes";
import { OPTIMISTIC_REFRESH_TASK_ID } from "@/lib/fetch-refresh-ui";
import { useOptionalHomeLayout } from "@/components/HomeLayoutContext";

/** 与 app/globals.css --layout-duration 一致 */
const ANALYSIS_PANEL_CLOSE_MS = 280;

/** 主列滚动条 thumb 在停滚后隐藏前的等待（与动效节奏一致） */
const MAIN_SCROLL_THUMB_IDLE_MS = 750;

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
  /** 为 true 时顶栏由 HomePageShell 提供，侧栏折叠态走 HomeLayoutContext */
  useShellLayout?: boolean;
  /** 挂载后 GET /api/recommended-sources?limit=2，缩短首页服务端 Promise.all */
  deferRecommendedSources?: boolean;
};

export default function MainContent({
  initialPosts,
  sources,
  recommendedSources = [],
  stats,
  user,
  initialBookmarkedIds,
  initialSubscribedSourceIds,
  isPersonalFeed,
  useShellLayout = false,
  deferRecommendedSources = false,
}: MainContentProps) {
  const optionalShell = useOptionalHomeLayout();
  const isShell = Boolean(useShellLayout && optionalShell);
  const [localCollapsed, setLocalCollapsed] = useState(true);
  const isSourcesListCollapsed = isShell ? optionalShell!.isSourcesListCollapsed : localCollapsed;
  const setIsSourcesListCollapsed = isShell
    ? optionalShell!.setIsSourcesListCollapsed
    : setLocalCollapsed;

  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [activeSource, setActiveSource] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [posts, setPosts] = useState<NewsItem[]>(initialPosts);
  const [sourcesState, setSourcesState] = useState<Source[]>(sources);
  const [recommendedState, setRecommendedState] = useState<Source[]>(recommendedSources);
  const [fetchingSourceIds, setFetchingSourceIds] = useState<Set<string>>(() => new Set());
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  // Figma 默认态没有“订阅引导大卡片”遮挡首页主内容
  // 非个性化 feed 时，默认直接展示推荐推文列表
  const [showRecommendedPosts, setShowRecommendedPosts] = useState(!isPersonalFeed);

  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisPostId, setAnalysisPostId] = useState<string | null>(null);
  /** 仅隐藏右栏 UI，保留 analysisPostId 以便再次展开 */
  const [isAnalysisSidebarCollapsed, setIsAnalysisSidebarCollapsed] = useState(false);
  const [analysisCache, setAnalysisCache] = useState<
    Record<
      string,
      {
        scores?: number | null;
        reliability?: number | null;
        review?: string | string[] | null;
        contextMatch?: string | null;
        originalTranslation?: string | null;
        originalTranslationReferenced?: string | null;
      }
    >
  >({});
  const [analysisLoadingPostId, setAnalysisLoadingPostId] = useState<string | null>(null);
  const [analysisErrorByPost, setAnalysisErrorByPost] = useState<Record<string, string>>({});
  /** 与 showAnalysisPanel 组合，首帧保持收起以便 CSS transition 有起点 */
  const [analysisMountReveal, setAnalysisMountReveal] = useState(false);
  const prevShowAnalysisPanelRef = useRef(false);
  const analysisCacheRef = useRef(analysisCache);
  analysisCacheRef.current = analysisCache;

  /** 前 N 条预取 INSIGHT：抓取入库后服务端已写入 insight_json 时，点开侧栏几乎无等待 */
  const insightPrefetchIds = useMemo(
    () => posts.slice(0, 48).map((p: NewsItem) => p.id),
    [posts],
  );
  const insightPrefetchKey = insightPrefetchIds.join("\0");

  const closeAnalysisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainScrollThumbIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshAbortRef = useRef<AbortController | null>(null);
  /** 主列滚动容器；顶栏/左右留白等处滚轮委托到此（侧栏展开且指针在侧栏内时不委托） */
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const sourcesSidebarPanelRef = useRef<HTMLDivElement | null>(null);
  const analysisSidebarPanelRef = useRef<HTMLDivElement | null>(null);

  const [mainScrollThumbVisible, setMainScrollThumbVisible] = useState(false);

  const clearCloseAnalysisTimer = useCallback(() => {
    if (closeAnalysisTimeoutRef.current) {
      clearTimeout(closeAnalysisTimeoutRef.current);
      closeAnalysisTimeoutRef.current = null;
    }
  }, []);

  const handleNeedAuth = useCallback(() => setShowAuthPrompt(true), []);

  const handleMainContentScroll = useCallback(() => {
    setMainScrollThumbVisible(true);
    if (mainScrollThumbIdleRef.current) {
      clearTimeout(mainScrollThumbIdleRef.current);
    }
    mainScrollThumbIdleRef.current = setTimeout(() => {
      mainScrollThumbIdleRef.current = null;
      setMainScrollThumbVisible(false);
    }, MAIN_SCROLL_THUMB_IDLE_MS);
  }, []);

  useEffect(
    () => () => {
      if (mainScrollThumbIdleRef.current) {
        clearTimeout(mainScrollThumbIdleRef.current);
        mainScrollThumbIdleRef.current = null;
      }
    },
    []
  );

  const { refreshSubscribedClientState, startSourceFetchPolling, handleSubscriptionSynced } =
    useSubscribedFeedSync(user, setSourcesState, setRecommendedState, setPosts, setFetchingSourceIds);

  // 收藏功能（乐观更新）
  const { bookmarkedIds, toggleBookmark } = useBookmark(
    new Set(initialBookmarkedIds),
    user,
    handleNeedAuth
  );

  const { subscribedIds, toggleSubscription } = useSubscription(
    new Set(initialSubscribedSourceIds),
    user,
    handleNeedAuth,
    handleSubscriptionSynced
  );

  useEffect(() => {
    if (!deferRecommendedSources) return;
    let cancelled = false;
    void fetch("/api/recommended-sources?limit=2", { cache: "no-store", credentials: "same-origin" })
      .then((res) => res.json())
      .then((data: { success?: boolean; sources?: Source[] }) => {
        if (cancelled || !data.success || !Array.isArray(data.sources)) return;
        setRecommendedState(data.sources);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deferRecommendedSources]);

  const isRunning = !!(task && (task.status === 'pending' || task.status === 'running'));
  /** 含「启动中」乐观态：按钮 FETCHING 与可点「暂停」同步 */
  const isFetchBusy =
    taskId === OPTIMISTIC_REFRESH_TASK_ID ||
    !!(task && (task.status === 'pending' || task.status === 'running'));

  /** SOURCES 列表来自访客占位（Supabase 不可用或尚无记录）且 Feed 为空时，提示与统计对齐 */
  const emptyFeedDemoSourcesHint = useMemo(
    () =>
      isPersonalFeed &&
      sourcesState.length > 0 &&
      sourcesState.every((s) => String(s.id).startsWith("guest-")),
    [isPersonalFeed, sourcesState]
  );

  const handleRefresh = async () => {
    if (!user) {
      setShowAuthPrompt(true);
      return;
    }
    if (isFetchBusy) {
      if (taskId === OPTIMISTIC_REFRESH_TASK_ID) {
        refreshAbortRef.current?.abort();
        refreshAbortRef.current = null;
      } else if (taskId) {
        void fetch("/api/refresh/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId }),
          cache: "no-store",
        }).catch(() => {});
      }
      setTaskId(null);
      setTask(null);
      return;
    }
    if (taskId && !isFetchBusy) {
      setTaskId(null);
      setTask(null);
      return;
    }

    const ac = new AbortController();
    refreshAbortRef.current = ac;

    setTask({
      id: OPTIMISTIC_REFRESH_TASK_ID,
      status: "running",
      progress: 0,
      message: "正在启动抓取…",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      startTime: Date.now(),
      estimatedDuration: 120,
      remainingTime: 120,
    });
    setTaskId(OPTIMISTIC_REFRESH_TASK_ID);

    try {
      sessionStorage.setItem("lastFetchTimestamp", Date.now().toString());
      sessionStorage.setItem("hasRefreshed", "false");
      const response = await fetch("/api/refresh", {
        method: "POST",
        cache: "no-store",
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;

      const result = await response.json();
      if (ac.signal.aborted) return;

      if (!response.ok || !result.success) {
        alert(result.error || "启动抓取任务失败");
        setTaskId(null);
        setTask(null);
        return;
      }
      setTaskId(result.taskId);
      if (result.task && typeof result.task === "object") {
        setTask(result.task as Task);
      }
    } catch (e) {
      if (ac.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) {
        return;
      }
      alert("网络请求失败，请检查网络连接后重试");
      setTaskId(null);
      setTask(null);
    } finally {
      if (refreshAbortRef.current === ac) {
        refreshAbortRef.current = null;
      }
    }
  };

  const handleTaskUpdate = useCallback((updatedTask: Task | null) => {
    setTask(updatedTask);
  }, []);

  const handleTaskComplete = useCallback(() => {
    setTaskId(null);
    setTask(null);
  }, []);

  const handleAddSource = useCallback((_type: 'blogger' | 'media' | 'academic') => {
    if (!user) { setShowAuthPrompt(true); return; }
    setShowAddSourceModal(true);
    setIsSourcesListCollapsed(false);
  }, [user]);

  /** Figma 侧栏 256px — 与画板列宽一致（非 320） */
  const sidebarWidth = isSourcesListCollapsed ? 0 : 256;

  /** 选中且未手动折叠右栏时显示 ANALYSIS */
  const showAnalysisPanel =
    analysisOpen && analysisPostId != null && !isAnalysisSidebarCollapsed;

  const analysisSlidesOpen = showAnalysisPanel && analysisMountReveal;

  /** 仅面板从关→开时双 rAF 揭示；同开仅换 analysisPostId 时不重置，避免右栏反复从左滑入 */
  useLayoutEffect(() => {
    if (analysisPostId == null) {
      setAnalysisMountReveal(false);
      prevShowAnalysisPanelRef.current = false;
      return;
    }
    if (!showAnalysisPanel) {
      setAnalysisMountReveal(false);
      prevShowAnalysisPanelRef.current = false;
      return;
    }
    const wasHidden = !prevShowAnalysisPanelRef.current;
    prevShowAnalysisPanelRef.current = true;
    if (wasHidden) {
      setAnalysisMountReveal(false);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setAnalysisMountReveal(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setAnalysisMountReveal((prev) => (prev ? prev : true));
  }, [analysisPostId, showAnalysisPanel]);

  useEffect(() => {
    const main = mainScrollRef.current;
    if (!main) return;

    const wheelDeltaPixels = (e: WheelEvent): number => {
      let dy = e.deltaY;
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) dy *= 16;
      else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) dy *= main.clientHeight || 0;
      return dy;
    };

    const onWheelCapture = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      const rawTarget = e.target;
      if (!(rawTarget instanceof Node)) return;

      if (main.contains(rawTarget)) return;

      if (!isSourcesListCollapsed && sourcesSidebarPanelRef.current?.contains(rawTarget)) return;

      if (analysisSlidesOpen && analysisSidebarPanelRef.current?.contains(rawTarget)) return;

      const el = rawTarget instanceof Element ? rawTarget : rawTarget.parentElement;
      if (el?.closest("input, textarea, select, [contenteditable='true'], [aria-modal='true']")) return;

      e.preventDefault();
      const dy = wheelDeltaPixels(e);
      if (dy === 0) return;
      main.scrollTop += dy;
    };

    window.addEventListener("wheel", onWheelCapture, { capture: true, passive: false });
    return () => window.removeEventListener("wheel", onWheelCapture, true);
  }, [isSourcesListCollapsed, analysisSlidesOpen]);

  /**
   * 顶栏仙女棒 / 卡片再次点 ANALYSIS：先 analysisOpen=false 保留 postId，让右栏与 SOURCES 一样
   * layout-sidebar-motion 收拢后再卸列，避免瞬间消失。
   */
  const closeAnalysisSession = useCallback(() => {
    clearCloseAnalysisTimer();
    setAnalysisOpen(false);
    if (analysisPostId == null) {
      setIsAnalysisSidebarCollapsed(false);
      return;
    }
    const finishClose = () => {
      closeAnalysisTimeoutRef.current = null;
      setAnalysisPostId(null);
      setIsAnalysisSidebarCollapsed(false);
    };
    if (!analysisSlidesOpen) {
      finishClose();
      return;
    }
    closeAnalysisTimeoutRef.current = setTimeout(finishClose, ANALYSIS_PANEL_CLOSE_MS);
  }, [
    analysisPostId,
    analysisSlidesOpen,
    clearCloseAnalysisTimer,
  ]);

  useEffect(() => {
    if (!isShell || !optionalShell) return;
    optionalShell.setAnalysisPanelOpen(showAnalysisPanel);
  }, [isShell, optionalShell, showAnalysisPanel]);

  useEffect(() => {
    if (!isShell || !optionalShell) return;
    optionalShell.onCollapseAnalysisRef.current = closeAnalysisSession;
    return () => {
      optionalShell.onCollapseAnalysisRef.current = null;
    };
  }, [isShell, optionalShell, closeAnalysisSession]);

  useEffect(
    () => () => {
      clearCloseAnalysisTimer();
    },
    [clearCloseAnalysisTimer]
  );

  const handleAnalysisToggle = useCallback(
    (postId: string) => {
      clearCloseAnalysisTimer();
      if (analysisPostId === postId && postId !== null && isAnalysisSidebarCollapsed) {
        setIsAnalysisSidebarCollapsed(false);
        return;
      }
      if (analysisPostId === postId && !analysisOpen) {
        setAnalysisOpen(true);
        return;
      }
      if (analysisPostId === postId) {
        closeAnalysisSession();
        return;
      }
      setAnalysisPostId(postId);
      setAnalysisOpen(true);
      setIsAnalysisSidebarCollapsed(false);
    },
    [
      analysisPostId,
      analysisOpen,
      isAnalysisSidebarCollapsed,
      clearCloseAnalysisTimer,
      closeAnalysisSession,
    ]
  );

  useEffect(() => {
    if (!analysisOpen || !analysisPostId) return;
    if (analysisCache[analysisPostId]) return;

    let cancelled = false;
    setAnalysisLoadingPostId(analysisPostId);
    setAnalysisErrorByPost((prev) => {
      const next = { ...prev };
      delete next[analysisPostId];
      return next;
    });

    (async () => {
      try {
        const res = await fetch("/api/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId: analysisPostId }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          const extra =
            typeof data.retryAfterSec === "number" && data.retryAfterSec > 0
              ? `（约 ${data.retryAfterSec} 秒后可重试）`
              : "";
          throw new Error((data.error || "分析生成失败") + extra);
        }
        const payload = data.analysis as {
          scores?: number | null;
          reliability?: number | null;
          review?: string | string[] | null;
          contextMatch?: string | null;
          originalTranslation?: string | null;
          originalTranslationReferenced?: string | null;
        };
        if (cancelled) return;
        setAnalysisCache((prev) => ({ ...prev, [analysisPostId]: payload }));
      } catch (e: unknown) {
        if (cancelled) return;
        const msg =
          e instanceof Error
            ? e.message
            : "分析暂时不可用，请稍后重试";
        setAnalysisErrorByPost((prev) => ({ ...prev, [analysisPostId]: msg }));
      } finally {
        if (!cancelled) setAnalysisLoadingPostId(null);
      }
    })();

    return () => {
      cancelled = true;
    };
    // 不可将 analysisLoadingPostId 放入依赖：setAnalysisLoadingPostId 会立刻重跑 effect，
    // cleanup 会把 in-flight 标为 cancelled，finally 不再清 loading → 界面永久「生成中」。
  }, [analysisOpen, analysisPostId, analysisCache]);

  useEffect(() => {
    if (insightPrefetchIds.length === 0) return;
    const needed = insightPrefetchIds.filter((id: string) => !analysisCacheRef.current[id]);
    if (needed.length === 0) return;
    let cancelled = false;
    type InsightPayload = (typeof analysisCache)[string];
    void (async () => {
      try {
        const res = await fetch("/api/analysis/prefetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postIds: needed }),
        });
        const data = await res.json();
        if (cancelled || !res.ok || !data.success || !data.analyses) return;
        const incoming = data.analyses as Record<string, InsightPayload>;
        setAnalysisCache((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const [id, payload] of Object.entries(incoming)) {
            if (next[id]) continue;
            next[id] = payload;
            changed = true;
          }
          return changed ? next : prev;
        });
      } catch {
        /* 预取失败不提示；打开 INSIGHT 时仍走 POST /api/analysis */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [insightPrefetchKey]);

  const retryInsightAnalysis = useCallback(() => {
    if (!analysisPostId) return;
    setAnalysisErrorByPost((prev) => {
      const next = { ...prev };
      delete next[analysisPostId];
      return next;
    });
    setAnalysisCache((prev) => {
      const next = { ...prev };
      delete next[analysisPostId];
      return next;
    });
  }, [analysisPostId]);

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

  const isGuestDefaultFeed =
    !user &&
    isPersonalFeed &&
    initialPosts.length > 0 &&
    initialPosts.length <= 5;

  const bodyShellClass = isShell
    ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-hidden bg-white lg:overflow-x-auto"
    : "relative flex h-dvh min-h-0 w-full min-w-0 flex-col items-stretch overflow-x-hidden overflow-y-hidden bg-white lg:overflow-x-auto";

  return (
    <>
      <div data-name="Body" data-node-id="3:2330" className={bodyShellClass}>
        {!isShell && (
          <>
            <TopBar
              user={user}
              isSourcesListCollapsed={isSourcesListCollapsed}
              onToggleSourcesListCollapsed={() => setIsSourcesListCollapsed((v) => !v)}
              analysisPanelOpen={showAnalysisPanel}
              onCollapseAnalysisSidebar={closeAnalysisSession}
            />

            <div className="w-full shrink-0 pt-14">
              <div
                data-name="Horizontal Divider"
                data-node-id="3:2694"
                className="h-px w-full bg-[#ebebef]"
                aria-hidden
              />
            </div>
          </>
        )}

        <div
          id="layout-grid"
          data-name="MAIN (1920*1024)"
          data-node-id="37:4551"
          className={`${MAIN_FRAME_GRID_SHELL_CLASS} ${analysisPostId != null ? MAIN_GRID_COLS_WITH_ANALYSIS : MAIN_GRID_COLS_NO_ANALYSIS}`}
        >
            <div
              id="layout-sources-col"
              data-name="SOURCES Frame"
              data-node-id="43:4890"
              className={`${MAIN_SIDE_FRAME_CLASS} z-[20] max-lg:h-0 max-lg:min-h-0 max-lg:flex-none max-lg:overflow-visible`}
            >
              <div
                className={[
                  "absolute right-[-0.5px] top-0 z-[20] h-full w-[256px] overflow-hidden bg-white max-lg:left-0 max-lg:right-auto max-lg:fixed max-lg:top-14 max-lg:bottom-0 max-lg:z-[92] max-lg:h-auto",
                  !isSourcesListCollapsed ? "max-lg:pointer-events-auto" : "max-lg:pointer-events-none",
                ].join(" ")}
              >
                {/* 以贴中栏的右缘为轴：折叠时 translate-x-full 向右藏入中缝侧，展开时向左铺开 */}
                <div
                  ref={sourcesSidebarPanelRef}
                  className={[
                    "flex h-full w-[256px] flex-col overflow-hidden bg-white",
                    "layout-sidebar-motion",
                    isSourcesListCollapsed
                      ? "pointer-events-none translate-x-full opacity-0"
                      : "pointer-events-auto translate-x-0 opacity-100",
                  ].join(" ")}
                  aria-hidden={isSourcesListCollapsed}
                >
          <SourcesList
                    sources={sourcesState}
                    recommendedSources={recommendedState}
                    currentSource={activeSource}
                    onSourceSelect={(handle) => setActiveSource(handle || "")}
                    onAddSource={() => handleAddSource("blogger")}
                    subscribedIds={subscribedIds}
                    onToggleSubscription={toggleSubscription}
                    fetchingSourceIds={fetchingSourceIds}
                    user={user}
                    isCollapsed={false}
                    onToggleCollapse={() => setIsSourcesListCollapsed(true)}
                  />
                </div>
              </div>
            </div>

            <div
              className={[
                VERTICAL_DIVIDER_AFTER_SOURCES_CLASS,
                isSourcesListCollapsed ? "pointer-events-none opacity-0" : "opacity-100",
              ].join(" ")}
              data-name="Vertical Divider"
              data-node-id="37:4808"
              aria-hidden
            />

            <div
              ref={mainScrollRef}
              id="layout-content-col"
              data-name="uAI News (800*1024)"
              data-node-id="37:4683"
              className={[
                "main-content-scroll relative z-0 box-border flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col items-stretch overflow-x-hidden overflow-y-auto bg-white px-4 py-5 sm:px-6 lg:max-w-none lg:flex-none lg:px-8 lg:py-[24px]",
                mainScrollThumbVisible ? "is-scrolling-thumb" : "",
              ].join(" ")}
              onScroll={handleMainContentScroll}
            >
              {/* Title+Stats 在 SiteHeader；Fetch 进度条贴在 Tab  sticky 区底部（Linear 式工具条） */}
              <SiteHeader stats={stats} />

              {/* 37:4718 Tab：pt-40 + 内层 37:4719 底边 h-46；进度与 Tab 同列 sticky，避免悬在标题与 Tab 之间 */}
              <div
                id="layout-category-filter"
                data-name="Tab"
                data-node-id="37:4718"
                className="sticky top-0 z-10 flex w-full shrink-0 flex-col items-stretch bg-white pt-[40px]"
              >
                <div
                  data-name="HorizontalBorder"
                  data-node-id="37:4719"
                  className="flex h-[46px] min-h-[46px] w-full shrink-0 flex-col items-stretch border-b border-[#ebebef] pb-px"
                >
                  <CategoryFilter
                    activeCategory={activeCategory}
                    onCategoryChange={setActiveCategory}
                    onFetch={handleRefresh}
                    isFetchRunning={isFetchBusy}
                  />
                </div>
                <div data-name="Refresh progress" className="w-full min-w-0">
                  <RefreshProgress
                    taskId={taskId}
                    task={task}
                    onTaskUpdate={handleTaskUpdate}
                    onTaskComplete={handleTaskComplete}
                  />
                </div>
              </div>

              {(isPersonalFeed || showRecommendedPosts) && (
                <div
                  data-name="Feed container"
                  data-node-id="37:4740"
                  className={[
                    "box-border flex min-h-0 w-full flex-1 flex-col items-stretch self-stretch pt-[24px]",
                    isGuestDefaultFeed ? "pb-80 sm:pb-96" : "pb-[128px]",
                  ].join(" ")}
                >
                  <NewsList
                    posts={filteredPosts}
                    bookmarkedIds={bookmarkedIds}
                    onBookmarkToggle={toggleBookmark}
                    analysisActivePostId={analysisPostId}
                    onAnalysisToggle={handleAnalysisToggle}
                    emptyFeedDemoSourcesHint={emptyFeedDemoSourcesHint}
                  />
                  {isGuestDefaultFeed && (
                    <section
                      className="mt-8 w-full min-w-0 pt-8"
                      aria-label="Sign in to unlock more content"
                    >
                      <div className="mx-auto flex w-full max-w-md min-w-0 flex-col items-center gap-6 px-4 pb-24 text-center sm:max-w-lg sm:px-0 sm:pb-32">
                        <div
                          className="flex items-center justify-center gap-3"
                          role="presentation"
                        >
                          <span className="h-px w-10 shrink-0 bg-[#ebebef] sm:w-12" aria-hidden />
                          <span className="shrink-0 font-mono text-[10px] font-medium uppercase leading-4 tracking-[0.12em] text-[#99a1af]">
                            Locked content
                          </span>
                          <span className="h-px w-10 shrink-0 bg-[#ebebef] sm:w-12" aria-hidden />
                        </div>
                        <div className="flex flex-col gap-2">
                          <p className="m-0 text-[16px] font-semibold leading-6 tracking-[-0.35px] text-[#101828] sm:text-[17px] sm:leading-7">
                            Unlock the full feed
                          </p>
                          <p className="m-0 text-[13px] font-normal leading-5 text-[#6a7282]">
                            Join uAI News for decoding and tailored insights.
                          </p>
                        </div>
                        <Link
                          href="/login"
                          className="btn-press inline-flex h-8 items-center justify-center rounded-[4px] bg-[#0055FF] px-4 text-xs font-medium text-white transition-colors hover:bg-[#0046CC]"
                        >
                          Sign in
                        </Link>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>

            {!isSourcesListCollapsed ? (
              <button
                type="button"
                className="pointer-events-auto fixed bottom-0 right-0 top-14 z-[15] max-lg:left-[256px] bg-black/35 lg:hidden"
                aria-label="关闭信息源列表"
                onClick={() => setIsSourcesListCollapsed(true)}
              />
            ) : null}

            <div
              className={[
                VERTICAL_DIVIDER_BEFORE_ANALYSIS_CLASS,
                showAnalysisPanel ? "opacity-100" : "pointer-events-none opacity-0",
              ].join(" ")}
              data-name="Vertical Divider"
              data-node-id="37:4682"
              aria-hidden
            />

            <div
              id="layout-analysis-col"
              data-name="ANALYSIS Frame"
              data-node-id="43:4891"
              className={[
                MAIN_SIDE_FRAME_CLASS,
                "z-[20]",
                analysisPostId == null ? "max-lg:hidden" : "",
                analysisPostId != null
                  ? "max-lg:h-0 max-lg:min-h-0 max-lg:flex-none max-lg:overflow-visible"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {analysisPostId != null ? (
                <div
                  className={[
                    "absolute left-0 top-0 z-[20] h-full w-full overflow-hidden max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-14 max-lg:z-[91] max-lg:h-auto",
                    showAnalysisPanel ? "max-lg:pointer-events-auto" : "max-lg:pointer-events-none",
                  ].join(" ")}
                >
                  {/* 以贴中栏的左缘为轴：折叠时 -translate-x-full 藏到接缝左侧，展开时向右滑入右栏 */}
                  <div
                    ref={analysisSidebarPanelRef}
                    data-name="ANALYSIS (336×viewport)"
                    className={[
                      "absolute left-0 top-0 box-border flex h-full min-h-0 w-[336px] min-w-[336px] max-w-[336px] flex-col items-stretch overflow-hidden bg-white",
                      "layout-sidebar-motion",
                      "max-lg:left-0 max-lg:right-0 max-lg:w-full max-lg:min-w-0 max-lg:max-w-none",
                      analysisSlidesOpen
                        ? "pointer-events-auto translate-x-0 opacity-100"
                        : "pointer-events-none -translate-x-full opacity-0",
                    ].join(" ")}
                    aria-hidden={!analysisSlidesOpen}
                  >
                    <AnalysisPanel
                      isOpen={analysisOpen}
                      post={posts.find((p) => p.id === analysisPostId) ?? null}
                      analysis={analysisCache[analysisPostId] ?? null}
                      isLoading={analysisLoadingPostId === analysisPostId}
                      analysisError={analysisErrorByPost[analysisPostId] ?? null}
                      onRetryAnalysis={retryInsightAnalysis}
                    />
                  </div>
                </div>
              ) : null}
            </div>
        </div>
      </div>

      <AddSourceModal
        isOpen={showAddSourceModal}
        onClose={() => setShowAddSourceModal(false)}
        onSourceAdded={
          user
            ? ({ source: added, taskId }) => {
                void refreshSubscribedClientState();
                if (taskId && added?.id) startSourceFetchPolling(added.id, taskId);
              }
            : undefined
        }
      />

      <AuthPromptModal isOpen={showAuthPrompt} onClose={() => setShowAuthPrompt(false)} />
    </>
  );
}
