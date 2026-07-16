"use client";

import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { NewsItem } from "@/lib/types";
import { RECOMMENDED_SIDEBAR_LIMIT } from "@/lib/feed-quality";
import type { Task } from "@/lib/task-manager";
import type { AuthUser } from "@/lib/auth";
type User = AuthUser;
import { useBookmark } from "@/hooks/useBookmark";
import { useSubscription } from "@/hooks/useSubscription";
import {
  useSubscribedFeedSync,
  type SourceFetchEvent,
} from "@/hooks/useSubscribedFeedSync";
import { useOpenLogin } from "@/hooks/useOpenLogin";
import SiteHeader from "./SiteHeader";
import TopBar from "./TopBar";
import RefreshProgress from "./RefreshButton";
import CategoryFilter from "./CategoryFilter";
import NewsList from "./NewsList";
import SourcesList from "./SourcesList";
import SourceActivityNotice, {
  type SourceActivityTone,
} from "./SourceActivityNotice";

import type { RecommendSourceRow } from "./SourceRecommendSection";

function ModalLoadingFallback({
  title,
  large = false,
}: {
  title: string;
  large?: boolean;
}) {
  return (
    <>
      <div className="modal-backdrop fixed inset-0 z-[100]" aria-hidden />
      <div
        className={[
          "modal-panel modal-panel-enter fixed left-1/2 top-1/2 z-[101] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 p-5",
          large ? "max-w-[760px]" : "max-w-[480px]",
        ].join(" ")}
        role="status"
        aria-live="polite"
      >
        <div className="mb-4 text-sm font-semibold text-[#101828]">{title}</div>
        <div className="grid gap-2">
          <div className="skeleton h-4 w-2/3 rounded-md" />
          <div className="skeleton h-9 rounded-md" />
          <div className="skeleton h-20 rounded-md" />
        </div>
      </div>
    </>
  );
}

const AddSourceModal = dynamic(() => import("./AddSourceModal"), {
  ssr: false,
  loading: () => <ModalLoadingFallback title="添加信息源" />,
});
const AddLongformModal = dynamic(() => import("./AddLongformModal"), { ssr: false });
const AuthPromptModal = dynamic(() => import("./AuthPromptModal"), { ssr: false });
const AnalysisPanel = dynamic(() => import("./AnalysisPanel"), { ssr: false });
const PassedPostsReviewPanel = dynamic(() => import("./PassedPostsReviewPanel"), {
  ssr: false,
  loading: () => <ModalLoadingFallback title="PASS 审核" large />,
});
const FetchPipelinePanel = dynamic(() => import("./FetchPipelinePanel"), {
  ssr: false,
  loading: () => <ModalLoadingFallback title="抓取与筛选设置" large />,
});
const LongformModule = dynamic(() => import("./LongformModule"), { ssr: false });
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
import { hasRawInsightPayload } from "@/lib/insight-echo-guard";
import { dedupeNewsItemsForDisplay } from "@/lib/news-dedupe";
import { compareNewsItemsForFeedDisplay } from "@/lib/feed-sort";
import { HOME_FEED_PAGE_SIZE, LONGFORM_FEED_PAGE_SIZE, type FeedPage } from "@/lib/feed-pagination";

/** Figma 侧栏宽 — 与画板列宽一致 */
const SOURCES_PANEL_WIDTH_PX = 256;
const ANALYSIS_PANEL_WIDTH_PX = 336;
/** 中栏 800px + 左右 1px 分隔线，与 TopBar / grid 列定义一致 */
const MAIN_CENTER_TRACK_PX = 802;

/** 与 app/globals.css --layout-duration 一致 */
const ANALYSIS_PANEL_CLOSE_MS = 220;
/** 首屏后空闲再跑，减少与 LCP/交互争抢（无 ric 时尽快延后一帧） */
function scheduleIdleTask(fn: () => void) {
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(() => fn(), { timeout: 2200 });
  } else {
    setTimeout(fn, 1);
  }
}

/** 停滚 200ms 后移除亮态；随后滑块在 300ms 内从可见淡至完全透明（见 globals.css） */
const MAIN_SCROLL_THUMB_IDLE_MS = 200;
const LONGFORM_CATEGORY = "优质长文";
const INSIGHT_PREFETCH_LIMIT = 12;
type NewBadgeCommitMode = "replace" | "merge";

function normalizeHandleForFilter(handle: unknown): string {
  return String(handle ?? "").trim().replace(/^@+/, "").toLowerCase();
}

function textMatchesQuery(value: unknown, lowerQuery: string): boolean {
  return String(value ?? "").toLowerCase().includes(lowerQuery);
}

function collectNewBadgePostIds(
  nextPosts: NewsItem[],
  previousIds: ReadonlySet<string>,
  startedAtMs: number
): Set<string> {
  const out = new Set<string>();
  for (const post of nextPosts) {
    if (previousIds.has(post.id)) continue;
    const createdAtMs = new Date(post.createdAt).getTime();
    if (Number.isFinite(createdAtMs) && createdAtMs >= startedAtMs) {
      out.add(post.id);
    }
  }
  return out;
}

function commitPostIdSetByMode(
  current: Set<string>,
  incoming: ReadonlySet<string>,
  mode: NewBadgeCommitMode
): Set<string> {
  if (mode === "replace") return new Set(incoming);
  if (incoming.size === 0) return current;
  const next = new Set(current);
  for (const id of incoming) next.add(id);
  return next;
}

function LongformStatusSection({
  title,
  detail,
  actionLabel,
  onAction,
}: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section
      aria-label="优质长文"
      className="w-full min-w-0 border-y border-[#f3f4f6] py-16 text-center"
    >
      <h2 className="m-0 text-[16px] font-semibold leading-6 text-[#101828]">{title}</h2>
      <p className="m-0 mt-2 text-[13px] leading-5 text-[#6a7282]">{detail}</p>
      {actionLabel && onAction ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            className="btn-primary btn-press rounded-md px-4 py-2 text-sm font-medium"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}

type Source = {
  id: string;
  handle: string;
  name: string;
  url?: string;
  avatar?: string;
  description?: string;
  enabled?: boolean;
  postCount: number;
  latestPostTime?: string;
  sourceType?: 'blogger' | 'media' | 'academic';
};

type SourceActivityState = {
  id: number;
  title: string;
  detail: string;
  tone: SourceActivityTone;
  isLeaving: boolean;
};

type FeedFilterPageMeta = {
  key: string;
  total: number;
  hasMore: boolean;
};

type NewBadgeCollectionWindow = {
  startedAtMs: number;
  baselinePostIds: Set<string>;
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
  initialFeedOffset?: number;
  initialFeedTotal?: number;
  initialFeedHasMore?: boolean;
  feedPageSize?: number;
  canLoadMoreFeed?: boolean;
  isPersonalFeed: boolean;              // true = 个性化 feed；false = 推荐 feed
  /** 为 true 时顶栏由 HomePageShell 提供，侧栏折叠态走 HomeLayoutContext */
  useShellLayout?: boolean;
  /** 为 true 时挂载后再拉推荐源（默认由服务端直出） */
  deferRecommendedSources?: boolean;
};

export default function MainContent({
  initialPosts,
  sources,
  recommendedSources = [],
  totalCount,
  stats,
  user,
  initialBookmarkedIds,
  initialSubscribedSourceIds,
  isPersonalFeed,
  initialFeedOffset = initialPosts.length,
  initialFeedTotal = totalCount,
  initialFeedHasMore = initialPosts.length < totalCount,
  feedPageSize = HOME_FEED_PAGE_SIZE,
  canLoadMoreFeed = true,
  useShellLayout = false,
  deferRecommendedSources = false,
}: MainContentProps) {
  const optionalShell = useOptionalHomeLayout();
  const openLogin = useOpenLogin();
  const [hasHydrated, setHasHydrated] = useState(false);
  const [localFetchPipelinePanelOpen, setLocalFetchPipelinePanelOpen] = useState(false);
  const [hasOpenedFetchPipelinePanel, setHasOpenedFetchPipelinePanel] = useState(false);
  const [showPassReviewPanel, setShowPassReviewPanel] = useState(false);
  const [hasOpenedPassReviewPanel, setHasOpenedPassReviewPanel] = useState(false);
  const hasShellLayout = Boolean(useShellLayout && optionalShell);
  const shellLayoutReady = hasHydrated && hasShellLayout;

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled || document.visibilityState !== "visible") return;
      scheduleIdleTask(() => {
        if (cancelled || document.visibilityState !== "visible") return;
        void import("./AddSourceModal");
        void import("./FetchPipelinePanel");
        void import("./PassedPostsReviewPanel");
      });
    }, 2600);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [hasHydrated]);

  const fetchPipelinePanelOpen = shellLayoutReady
    ? optionalShell!.fetchPipelinePanelOpen
    : localFetchPipelinePanelOpen;
  const openFetchPipelinePanel = useCallback(() => {
    if (shellLayoutReady && optionalShell) {
      optionalShell.setFetchPipelinePanelOpen(true);
    } else {
      setLocalFetchPipelinePanelOpen(true);
    }
  }, [shellLayoutReady, optionalShell]);
  const closeFetchPipelinePanel = useCallback(() => {
    if (shellLayoutReady && optionalShell) {
      optionalShell.setFetchPipelinePanelOpen(false);
    } else {
      setLocalFetchPipelinePanelOpen(false);
    }
  }, [shellLayoutReady, optionalShell]);

  useEffect(() => {
    const openFromTopBar = () => openFetchPipelinePanel();
    window.addEventListener("uai:open-fetch-pipeline-panel", openFromTopBar);
    return () => window.removeEventListener("uai:open-fetch-pipeline-panel", openFromTopBar);
  }, [openFetchPipelinePanel]);
  useEffect(() => {
    if (fetchPipelinePanelOpen) {
      setHasOpenedFetchPipelinePanel(true);
    }
  }, [fetchPipelinePanelOpen]);
  useEffect(() => {
    const openFromTopBar = () => setShowPassReviewPanel(true);
    window.addEventListener("uai:open-pass-review", openFromTopBar);
    return () => window.removeEventListener("uai:open-pass-review", openFromTopBar);
  }, []);
  useEffect(() => {
    if (showPassReviewPanel) {
      setHasOpenedPassReviewPanel(true);
    }
  }, [showPassReviewPanel]);
  const [localCollapsed, setLocalCollapsed] = useState(true);
  // Keep the first client render identical to the server HTML. The shell top bar
  // can update context while this Suspense-loaded feed is still hydrating.
  const isSourcesListCollapsed = shellLayoutReady
    ? optionalShell!.isSourcesListCollapsed
    : localCollapsed;
  const setIsSourcesListCollapsed = shellLayoutReady
    ? optionalShell!.setIsSourcesListCollapsed
    : setLocalCollapsed;

  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [showAddLongformModal, setShowAddLongformModal] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  /** 与 taskId 同步；用户点「暂停」时先手动置空，避免轮询 await 返回后把 task 写回 running */
  const activeFetchTaskIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeFetchTaskIdRef.current = taskId;
  }, [taskId]);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [activeSource, setActiveSource] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [posts, setPosts] = useState<NewsItem[]>(initialPosts);
  const [newBadgePostIds, setNewBadgePostIds] = useState<Set<string>>(() => new Set());
  const [newBadgeSortPostIds, setNewBadgeSortPostIds] = useState<Set<string>>(() => new Set());
  const preserveClientFeedUntilRef = useRef(0);
  const [feedOffset, setFeedOffset] = useState(initialFeedOffset);
  const [feedTotal, setFeedTotal] = useState(initialFeedTotal);
  const [feedHasMore, setFeedHasMore] = useState(initialFeedHasMore);
  const [isLoadingMoreFeed, setIsLoadingMoreFeed] = useState(false);
  const [loadMoreFeedError, setLoadMoreFeedError] = useState("");
  const [feedFilterPageMeta, setFeedFilterPageMeta] = useState<FeedFilterPageMeta | null>(null);
  const [longformLoaded, setLongformLoaded] = useState(() =>
    initialPosts.some((post) => Boolean(post.longform?.translatedContent))
  );
  const [longformLoading, setLongformLoading] = useState(false);
  const [longformLoadingMore, setLongformLoadingMore] = useState(false);
  const [longformError, setLongformError] = useState("");
  const [longformLoadMoreError, setLongformLoadMoreError] = useState("");
  const [longformOffset, setLongformOffset] = useState(0);
  const [longformTotal, setLongformTotal] = useState(0);
  const [longformHasMore, setLongformHasMore] = useState(false);
  const [longformPreviewIds, setLongformPreviewIds] = useState<Set<string>>(() => new Set());
  const [longformFullLoadingIds, setLongformFullLoadingIds] = useState<Set<string>>(() => new Set());
  const [longformFullErrorById, setLongformFullErrorById] = useState<Record<string, string>>({});
  const [longformActionPendingIds, setLongformActionPendingIds] = useState<Set<string>>(() => new Set());
  const [passPendingIds, setPassPendingIds] = useState<Set<string>>(() => new Set());
  const [sourcesState, setSourcesState] = useState<Source[]>(sources);
  const [recommendedState, setRecommendedState] = useState<Source[]>(recommendedSources);
  const [fetchingSourceIds, setFetchingSourceIds] = useState<Set<string>>(() => new Set());
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [sourceActivity, setSourceActivity] = useState<SourceActivityState | null>(null);
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
    () =>
      posts
        .filter((post: NewsItem) => !post.longform?.translatedContent)
        .slice(0, INSIGHT_PREFETCH_LIMIT)
        .map((post: NewsItem) => post.id),
    [posts],
  );
  const insightPrefetchKey = insightPrefetchIds.join("\0");

  const closeAnalysisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainScrollThumbIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const refreshStartedAtRef = useRef<number | null>(null);
  const refreshBaselinePostIdsRef = useRef<Set<string>>(new Set());
  const newBadgeCollectionWindowRef = useRef<NewBadgeCollectionWindow | null>(null);
  const newBadgeCommitModeRef = useRef<NewBadgeCommitMode>("replace");
  const passPendingIdsRef = useRef<Set<string>>(new Set());
  const longformActionPendingIdsRef = useRef<Set<string>>(new Set());
  const sourceActivityExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceActivityRemoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceActivityIdRef = useRef(0);
  /** 主列滚动容器；顶栏/左右留白等处滚轮委托到此（侧栏展开且指针在侧栏内时不委托） */
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const sourcesSidebarPanelRef = useRef<HTMLDivElement | null>(null);
  const analysisSidebarPanelRef = useRef<HTMLDivElement | null>(null);

  const clearCloseAnalysisTimer = useCallback(() => {
    if (closeAnalysisTimeoutRef.current) {
      clearTimeout(closeAnalysisTimeoutRef.current);
      closeAnalysisTimeoutRef.current = null;
    }
  }, []);

  const handleNeedAuth = useCallback(() => setShowAuthPrompt(true), []);

  const clearRefreshNewBadgeContext = useCallback((clearCollectionWindow = true) => {
    refreshStartedAtRef.current = null;
    refreshBaselinePostIdsRef.current = new Set();
    newBadgeCommitModeRef.current = "replace";
    if (clearCollectionWindow) {
      newBadgeCollectionWindowRef.current = null;
    }
  }, []);

  const beginNewBadgeCollection = useCallback(
    (startedAtMs: number, baselinePostIds: Set<string>, mode: NewBadgeCommitMode) => {
      refreshStartedAtRef.current = startedAtMs;
      refreshBaselinePostIdsRef.current = baselinePostIds;
      newBadgeCommitModeRef.current = mode;
      newBadgeCollectionWindowRef.current = { startedAtMs, baselinePostIds };
    },
    []
  );

  const collectNewBadgesForLoadedPosts = useCallback((loadedPosts: NewsItem[]) => {
    const collectionWindow = newBadgeCollectionWindowRef.current;
    if (!collectionWindow || loadedPosts.length === 0) return;

    const collected = collectNewBadgePostIds(
      loadedPosts,
      collectionWindow.baselinePostIds,
      collectionWindow.startedAtMs
    );
    if (collected.size === 0) return;

    setNewBadgePostIds((current) => commitPostIdSetByMode(current, collected, "merge"));
    setNewBadgeSortPostIds((current) => commitPostIdSetByMode(current, collected, "merge"));
  }, []);

  const commitNewBadgesFromPosts = useCallback((nextPosts: NewsItem[]) => {
    const startedAtMs = refreshStartedAtRef.current;
    if (startedAtMs == null) return;
    const baselinePostIds = refreshBaselinePostIdsRef.current;

    const collected = collectNewBadgePostIds(
      nextPosts,
      baselinePostIds,
      startedAtMs
    );
    newBadgeCollectionWindowRef.current = { startedAtMs, baselinePostIds };
    const mode = newBadgeCommitModeRef.current;
    setNewBadgePostIds((current) => commitPostIdSetByMode(current, collected, mode));
    setNewBadgeSortPostIds((current) => commitPostIdSetByMode(current, collected, mode));
    clearRefreshNewBadgeContext(false);
  }, [clearRefreshNewBadgeContext]);

  const dismissNewBadge = useCallback((postId: string) => {
    setNewBadgePostIds((current) => {
      if (!current.has(postId)) return current;
      const next = new Set(current);
      next.delete(postId);
      return next;
    });
  }, []);

  const clearSourceActivityTimers = useCallback(() => {
    if (sourceActivityExitTimerRef.current) {
      clearTimeout(sourceActivityExitTimerRef.current);
      sourceActivityExitTimerRef.current = null;
    }
    if (sourceActivityRemoveTimerRef.current) {
      clearTimeout(sourceActivityRemoveTimerRef.current);
      sourceActivityRemoveTimerRef.current = null;
    }
  }, []);

  const showSourceActivity = useCallback(
    (
      next: Omit<SourceActivityState, "id" | "isLeaving">,
      visibleForMs = 5200
    ) => {
      clearSourceActivityTimers();
      const id = ++sourceActivityIdRef.current;
      setSourceActivity({ ...next, id, isLeaving: false });

      const exitDelay = Math.max(0, visibleForMs - 180);
      sourceActivityExitTimerRef.current = setTimeout(() => {
        setSourceActivity((current) =>
          current?.id === id ? { ...current, isLeaving: true } : current
        );
      }, exitDelay);
      sourceActivityRemoveTimerRef.current = setTimeout(() => {
        setSourceActivity((current) => (current?.id === id ? null : current));
      }, visibleForMs);
    },
    [clearSourceActivityTimers]
  );

  const handleSourceFetchEvent = useCallback(
    ({ sourceHandle, status }: SourceFetchEvent) => {
      const normalizedHandle = sourceHandle?.trim().replace(/^@+/, "");
      const sourceLabel = normalizedHandle ? `@${normalizedHandle}` : "该信息源";

      if (status === "started") {
        beginNewBadgeCollection(Date.now(), new Set(posts.map((post) => post.id)), "merge");
        showSourceActivity({
          title: `已订阅 ${sourceLabel}`,
          detail: "正在抓取首批推文，完成后会自动更新信息流。",
          tone: "working",
        });
        return;
      }

      if (status === "completed") {
        showSourceActivity(
          {
            title: `${sourceLabel} 的内容已更新`,
            detail: "首批推文已经加入信息流。",
            tone: "success",
          },
          3400
        );
        return;
      }

      clearRefreshNewBadgeContext();
      showSourceActivity(
        {
          title: `${sourceLabel} 暂未抓取完成`,
          detail: "订阅已保存，可稍后在抓取面板中重试。",
          tone: "error",
        },
        6200
      );
    },
    [beginNewBadgeCollection, clearRefreshNewBadgeContext, posts, showSourceActivity]
  );

  const handleMainContentScroll = useCallback(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    el.classList.add("is-scrolling-thumb");
    if (mainScrollThumbIdleRef.current) {
      clearTimeout(mainScrollThumbIdleRef.current);
    }
    mainScrollThumbIdleRef.current = setTimeout(() => {
      mainScrollThumbIdleRef.current = null;
      el.classList.remove("is-scrolling-thumb");
    }, MAIN_SCROLL_THUMB_IDLE_MS);
  }, []);

  useEffect(
    () => () => {
      if (mainScrollThumbIdleRef.current) {
        clearTimeout(mainScrollThumbIdleRef.current);
        mainScrollThumbIdleRef.current = null;
      }
      clearSourceActivityTimers();
    },
    [clearSourceActivityTimers]
  );

  /** FETCH 完成后 router.refresh() 会更新 RSC props；useState 初值不会跟 props 变，需同步 */
  useEffect(() => {
    const shouldPreserveClientFeed = Date.now() < preserveClientFeedUntilRef.current;
    setPosts((current) => {
      if (shouldPreserveClientFeed && current.length > 0) {
        const byId = new Map(current.map((post) => [post.id, post]));
        for (const post of initialPosts) {
          if (!byId.has(post.id)) {
            byId.set(post.id, post);
          }
        }
        return dedupeNewsItemsForDisplay(Array.from(byId.values()));
      }

      const byId = new Map(initialPosts.map((post) => [post.id, post]));
      for (const post of current) {
        if (post.longform?.translatedContent && !byId.has(post.id)) {
          byId.set(post.id, post);
        }
      }
      return dedupeNewsItemsForDisplay(Array.from(byId.values()));
    });
    setFeedOffset(initialFeedOffset);
    setFeedTotal(initialFeedTotal);
    setFeedHasMore(initialFeedHasMore);
    setFeedFilterPageMeta(null);
    setLoadMoreFeedError("");
    if (initialPosts.some((post) => Boolean(post.longform?.translatedContent))) {
      setLongformLoaded(true);
    }
    collectNewBadgesForLoadedPosts(initialPosts);
  }, [
    collectNewBadgesForLoadedPosts,
    initialFeedHasMore,
    initialFeedOffset,
    initialFeedTotal,
    initialPosts,
  ]);

  useEffect(() => {
    setSourcesState(sources);
  }, [sources]);

  useEffect(() => {
    if (deferRecommendedSources) return;
    setRecommendedState(recommendedSources);
  }, [recommendedSources, deferRecommendedSources]);

  const handleFeedPageSynced = useCallback(
    (page: Pick<FeedPage, "nextOffset" | "total" | "hasMore">) => {
      setFeedOffset(page.nextOffset);
      setFeedTotal(page.total);
      setFeedHasMore(page.hasMore);
      setLoadMoreFeedError("");
    },
    []
  );

  const handleFeedPostsSynced = useCallback(
    (page: FeedPage) => {
      commitNewBadgesFromPosts(page.posts);
    },
    [commitNewBadgesFromPosts]
  );

  const { refreshSubscribedClientState, startSourceFetchPolling, handleSubscriptionSynced } =
    useSubscribedFeedSync(
      user,
      setSourcesState,
      setRecommendedState,
      setPosts,
      setFetchingSourceIds,
      handleSourceFetchEvent,
      handleFeedPageSynced,
      handleFeedPostsSynced
    );

  const initialBookmarkedIdSet = useMemo(
    () => new Set(initialBookmarkedIds),
    [initialBookmarkedIds]
  );
  const initialSubscribedSourceIdSet = useMemo(
    () => new Set(initialSubscribedSourceIds),
    [initialSubscribedSourceIds]
  );

  // 收藏功能（乐观更新）
  const { bookmarkedIds, pendingIds: bookmarkPendingIds, toggleBookmark } = useBookmark(
    initialBookmarkedIdSet,
    user,
    handleNeedAuth,
    { initialItems: posts }
  );

  const initialSubscribedHandles = useMemo(
    () => sourcesState.map((s) => s.handle),
    [sourcesState]
  );

  const { subscribedIds, subscribedHandles, subscribeSource } = useSubscription(
    initialSubscribedSourceIdSet,
    initialSubscribedHandles,
    user,
    handleNeedAuth,
    handleSubscriptionSynced
  );

  const handleRecommendSubscribe = useCallback(
    async (source: RecommendSourceRow) => {
      const norm = source.handle.toLowerCase();
      showSourceActivity({
        title: `正在订阅 @${source.handle.replace(/^@+/, "")}`,
        detail: "订阅成功后会立即开始抓取首批推文。",
        tone: "working",
      });
      setRecommendedState((prev) =>
        prev.filter((s) => s.id !== source.id && s.handle.toLowerCase() !== norm)
      );
      setSourcesState((prev) => {
        if (prev.some((s) => s.handle.toLowerCase() === norm)) return prev;
        return [
          ...prev,
          {
            id: source.id,
            handle: source.handle,
            name: source.name,
            url: source.url,
            avatar: source.avatar,
            description: source.description,
            postCount: 0,
            sourceType: source.sourceType ?? "blogger",
          },
        ];
      });
      const result = await subscribeSource(source.id, source.handle);
      if (!result.ok) {
        showSourceActivity(
          {
            title: `未能订阅 @${source.handle.replace(/^@+/, "")}`,
            detail: "请检查网络后重试，当前推荐仍为你保留。",
            tone: "error",
          },
          6200
        );
        setRecommendedState((prev) => {
          if (prev.some((s) => s.id === source.id)) return prev;
          return [...prev, source as Source];
        });
        setSourcesState((prev) => prev.filter((s) => s.handle.toLowerCase() !== norm));
        return;
      }

      if (!result.fetchTaskId) {
        showSourceActivity(
          {
            title: `已订阅 @${source.handle.replace(/^@+/, "")}`,
            detail: "当前已有可用内容，已直接同步到你的信息流。",
            tone: "success",
          },
          3800
        );
      }
    },
    [showSourceActivity, subscribeSource]
  );

  const handleRecommendedChange = useCallback((nextSources: RecommendSourceRow[]) => {
    setRecommendedState(
      nextSources.map((source) => ({
        ...source,
        postCount: 0,
      }))
    );
  }, []);

  const loadLongformPosts = useCallback(async (options?: { append?: boolean }) => {
    const append = options?.append === true;
    if (append ? longformLoadingMore : longformLoading) return;
    if (append) {
      setLongformLoadingMore(true);
    } else {
      setLongformLoading(true);
    }
    setLongformError("");
    setLongformLoadMoreError("");
    const requestOffset = append ? longformOffset : 0;
    try {
      const params = new URLSearchParams({
        offset: String(requestOffset),
        limit: String(LONGFORM_FEED_PAGE_SIZE),
      });
      const res = await fetch(`/api/longform/posts?${params.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as Partial<FeedPage> & {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !data.success || !Array.isArray(data.posts)) {
        throw new Error(data.error || "长文加载失败");
      }
      const nextPosts = data.posts ?? [];
      setPosts((current) => {
        const base = append
          ? current
          : current.filter((post) => !post.longform?.translatedContent);
        const byId = new Map(base.map((post) => [post.id, post]));
        for (const post of nextPosts) {
          byId.set(post.id, post);
        }
        return dedupeNewsItemsForDisplay(Array.from(byId.values()));
      });
      setLongformPreviewIds((current) => {
        const next = append ? new Set(current) : new Set<string>();
        for (const post of nextPosts) next.add(post.id);
        return next;
      });
      setLongformOffset(data.nextOffset ?? requestOffset + nextPosts.length);
      setLongformTotal(data.total ?? nextPosts.length);
      setLongformHasMore(Boolean(data.hasMore));
      setLongformLoaded(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "长文加载失败";
      if (append) {
        setLongformLoadMoreError(message);
      } else {
        setLongformError(message);
      }
    } finally {
      if (append) {
        setLongformLoadingMore(false);
      } else {
        setLongformLoading(false);
      }
    }
  }, [longformLoading, longformLoadingMore, longformOffset]);

  const loadMoreLongformPosts = useCallback(() => {
    if (!longformHasMore || longformLoadingMore) return;
    void loadLongformPosts({ append: true });
  }, [longformHasMore, longformLoadingMore, loadLongformPosts]);

  const loadFullLongformPost = useCallback(async (postId: string) => {
    if (!longformPreviewIds.has(postId) || longformFullLoadingIds.has(postId)) return;
    setLongformFullLoadingIds((current) => new Set(current).add(postId));
    setLongformFullErrorById((current) => {
      const next = { ...current };
      delete next[postId];
      return next;
    });
    try {
      const res = await fetch(`/api/longform/posts/${encodeURIComponent(postId)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        post?: NewsItem;
        error?: string;
      };
      if (!res.ok || !data.success || !data.post?.longform?.translatedContent) {
        throw new Error(data.error || "长文正文加载失败");
      }
      setPosts((current) => current.map((post) => (post.id === postId ? data.post! : post)));
      setLongformPreviewIds((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    } catch (error) {
      setLongformFullErrorById((current) => ({
        ...current,
        [postId]: error instanceof Error ? error.message : "长文正文加载失败",
      }));
    } finally {
      setLongformFullLoadingIds((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
  }, [longformFullLoadingIds, longformPreviewIds]);

  const isRunning = !!(task && (task.status === 'pending' || task.status === 'running'));
  /** 含「启动中」乐观态：按钮 FETCHING 与可点「暂停」同步 */
  const isFetchBusy =
    taskId === OPTIMISTIC_REFRESH_TASK_ID ||
    !!(task && (task.status === 'pending' || task.status === 'running'));

  /** 已订阅信息源但 feed 仍为空（后台抓取进行中） */
  const emptyFeedAwaitingFetch = useMemo(
    () => isPersonalFeed && sourcesState.length > 0 && posts.length === 0,
    [isPersonalFeed, sourcesState.length, posts.length]
  );

  useEffect(() => {
    if (!emptyFeedAwaitingFetch || !user) return;
    const iv = setInterval(() => {
      void refreshSubscribedClientState(
        refreshStartedAtRef.current == null ? undefined : { notifyFeedPostsSynced: false }
      );
    }, 15000);
    return () => clearInterval(iv);
  }, [emptyFeedAwaitingFetch, user, refreshSubscribedClientState]);

  const handleRefresh = async () => {
    if (!user) {
      setShowAuthPrompt(true);
      return;
    }
    if (isFetchBusy) {
      activeFetchTaskIdRef.current = null;
      clearRefreshNewBadgeContext();
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
      activeFetchTaskIdRef.current = null;
      setTaskId(null);
      setTask(null);
    }

    const ac = new AbortController();
    refreshAbortRef.current = ac;
    const refreshStartedAt = Date.now();
    beginNewBadgeCollection(refreshStartedAt, new Set(posts.map((post) => post.id)), "replace");
    setNewBadgePostIds(new Set());

    activeFetchTaskIdRef.current = OPTIMISTIC_REFRESH_TASK_ID;
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
      const response = await fetch("/api/refresh", {
        method: "POST",
        cache: "no-store",
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;

      const result = await response.json();
      if (ac.signal.aborted) return;

      if (!response.ok || !result.success) {
        activeFetchTaskIdRef.current = null;
        clearRefreshNewBadgeContext();
        alert(result.error || "启动抓取任务失败");
        setTaskId(null);
        setTask(null);
        return;
      }
      activeFetchTaskIdRef.current = result.taskId;
      setTaskId(result.taskId);
      if (result.task && typeof result.task === "object") {
        setTask(result.task as Task);
      }
    } catch (e) {
      if (ac.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) {
        return;
      }
      activeFetchTaskIdRef.current = null;
      alert("网络请求失败，请检查网络连接后重试");
      clearRefreshNewBadgeContext();
      setTaskId(null);
      setTask(null);
    } finally {
      if (refreshAbortRef.current === ac) {
        refreshAbortRef.current = null;
      }
    }
  };

  const handleTaskUpdate = useCallback((updatedTask: Task | null) => {
    if (updatedTask != null && updatedTask.id !== activeFetchTaskIdRef.current) {
      return;
    }
    setTask(updatedTask);
  }, []);

  const handleTaskComplete = useCallback(() => {
    activeFetchTaskIdRef.current = null;
    setTaskId(null);
    setTask(null);
    preserveClientFeedUntilRef.current = Date.now() + 30_000;
    void refreshSubscribedClientState({ prioritizeRecentlyFetched: true }).then((page) => {
      if (!page?.posts) {
        preserveClientFeedUntilRef.current = 0;
        clearRefreshNewBadgeContext();
      }
    });
  }, [clearRefreshNewBadgeContext, refreshSubscribedClientState]);

  const handleAddSource = useCallback((_type: 'blogger' | 'media' | 'academic') => {
    setShowAddSourceModal(true);
    setIsSourcesListCollapsed(false);
  }, [setIsSourcesListCollapsed]);
  const handleAddBloggerSource = useCallback(() => handleAddSource("blogger"), [handleAddSource]);
  const handleLongformImported = useCallback((post: NewsItem) => {
    setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)]);
    setLongformPreviewIds((current) => {
      const next = new Set(current);
      next.delete(post.id);
      return next;
    });
    setLongformLoaded(true);
    setActiveCategory(LONGFORM_CATEGORY);
    setShowRecommendedPosts(true);
  }, []);
  const handleLongformExtractFromPost = useCallback(
    async (post: NewsItem) => {
      if (longformActionPendingIdsRef.current.has(post.id)) return;

      longformActionPendingIdsRef.current.add(post.id);
      setLongformActionPendingIds(new Set(longformActionPendingIdsRef.current));

      try {
        const res = await fetch("/api/longform/from-post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ postId: post.id }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          code?: string;
          error?: string;
          post?: NewsItem;
          alreadyExists?: boolean;
        };

        if (!res.ok || !data.success || !data.post?.longform?.translatedContent) {
          const isNoLongform = data.code === "NO_LONGFORM" || res.status === 404;
          showSourceActivity(
            {
              title: isNoLongform ? "没有长文存在" : "长文抓取失败",
              detail:
                data.error ||
                (isNoLongform
                  ? "这条推文里没有识别到可抓取的文章链接或论文截图。"
                  : "请稍后重试。"),
              tone: "error",
            },
            isNoLongform ? 4200 : 5600,
          );
          return;
        }

        setPosts((current) =>
          current.map((item) => (item.id === data.post!.id ? data.post! : item))
        );
        setLongformPreviewIds((current) => {
          const next = new Set(current);
          next.delete(data.post!.id);
          return next;
        });
        setLongformLoaded(true);
        setActiveCategory(LONGFORM_CATEGORY);
        setShowRecommendedPosts(true);
        showSourceActivity(
          {
            title: data.alreadyExists ? "这条推文已有长文" : "长文已添加",
            detail: "已放入「优质长文」，可以继续阅读或展开原文。",
            tone: "success",
          },
          3600,
        );
      } catch (error) {
        showSourceActivity(
          {
            title: "长文抓取失败",
            detail: error instanceof Error ? error.message : "请稍后重试。",
            tone: "error",
          },
          5600,
        );
      } finally {
        longformActionPendingIdsRef.current.delete(post.id);
        setLongformActionPendingIds(new Set(longformActionPendingIdsRef.current));
      }
    },
    [showSourceActivity],
  );
  const handleSourceSelect = useCallback((handle?: string) => {
    setActiveSource(handle || "");
  }, []);
  const toggleSourcesListCollapsed = useCallback(() => {
    setIsSourcesListCollapsed((v) => !v);
  }, [setIsSourcesListCollapsed]);
  const collapseSourcesList = useCallback(() => {
    setIsSourcesListCollapsed(true);
  }, [setIsSourcesListCollapsed]);

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
    if (!hasShellLayout || !optionalShell) return;
    optionalShell.setAnalysisPanelOpen(showAnalysisPanel);
  }, [hasShellLayout, optionalShell, showAnalysisPanel]);

  useEffect(() => {
    if (!hasShellLayout || !optionalShell) return;
    optionalShell.onCollapseAnalysisRef.current = closeAnalysisSession;
    return () => {
      optionalShell.onCollapseAnalysisRef.current = null;
    };
  }, [hasShellLayout, optionalShell, closeAnalysisSession]);

  useEffect(
    () => () => {
      clearCloseAnalysisTimer();
    },
    [clearCloseAnalysisTimer]
  );

  const handleAnalysisToggle = useCallback(
    (postId: string) => {
      clearCloseAnalysisTimer();
      dismissNewBadge(postId);
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
      dismissNewBadge,
      closeAnalysisSession,
    ]
  );

  const handlePassPost = useCallback(
    async (post: NewsItem) => {
      if (!user) {
        setShowAuthPrompt(true);
        return;
      }
      if (passPendingIdsRef.current.has(post.id)) return;

      const previousPosts = posts;
      passPendingIdsRef.current.add(post.id);
      setPassPendingIds(new Set(passPendingIdsRef.current));
      setPosts((current) => current.filter((item) => item.id !== post.id));
      if (analysisPostId === post.id) {
        closeAnalysisSession();
      }

      try {
        const res = await fetch("/api/me/pass-post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ post }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
        };
        if (!res.ok || !data.success) {
          throw new Error(data.error || "PASS 推文失败");
        }
        showSourceActivity(
          {
            title: "已 PASS 这条推文",
            detail: "后续抓取和推荐会少展示类似内容。",
            tone: "success",
          },
          3200
        );
      } catch (error) {
        setPosts(previousPosts);
        showSourceActivity(
          {
            title: "PASS 失败",
            detail: error instanceof Error ? error.message : "请检查网络后重试。",
            tone: "error",
          },
          5200
        );
      } finally {
        passPendingIdsRef.current.delete(post.id);
        setPassPendingIds(new Set(passPendingIdsRef.current));
      }
    },
    [analysisPostId, closeAnalysisSession, posts, showSourceActivity, user]
  );

  useEffect(() => {
    if (!analysisOpen || !analysisPostId) return;
    const cached = analysisCacheRef.current[analysisPostId];
    if (cached && hasRawInsightPayload(cached)) {
      setAnalysisLoadingPostId((cur) => (cur === analysisPostId ? null : cur));
      return;
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- analysisCacheRef is stable; including analysisCache would cause infinite re-fetch loops
  }, [analysisOpen, analysisPostId]);

  useEffect(() => {
    if (insightPrefetchIds.length === 0) return;
    let cancelled = false;
    type InsightPayload = (typeof analysisCache)[string];
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      const needed = insightPrefetchIds.filter(
        (id: string) => !analysisCacheRef.current[id]
      );
      if (needed.length === 0) return;

      void (async () => {
        try {
          const res = await fetch("/api/analysis/prefetch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            cache: "no-store",
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
    }, 3200);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
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

  const sortedPosts = useMemo(() => {
    return dedupeNewsItemsForDisplay(
      [...posts].sort((a, b) => {
        const newBadgeDiff =
          Number(newBadgeSortPostIds.has(b.id)) - Number(newBadgeSortPostIds.has(a.id));
        if (newBadgeDiff !== 0) return newBadgeDiff;
        return compareNewsItemsForFeedDisplay(a, b);
      })
    );
  }, [newBadgeSortPostIds, posts]);

  const analysisPost = useMemo(
    () => (analysisPostId ? posts.find((p) => p.id === analysisPostId) ?? null : null),
    [posts, analysisPostId]
  );

  const isLongformCategory = activeCategory === LONGFORM_CATEGORY;

  useEffect(() => {
    if (!isLongformCategory || longformLoaded || longformLoading) return;
    void loadLongformPosts();
  }, [isLongformCategory, longformLoaded, longformLoading, loadLongformPosts]);

  // 在客户端进行筛选（纯内存操作，无服务端请求）
  const filteredPosts = useMemo(() => {
    let result = sortedPosts.filter((post) =>
      isLongformCategory
        ? Boolean(post.longform?.translatedContent)
        : !post.longform?.translatedContent
    );

    if (!isLongformCategory && activeCategory && activeCategory !== "all") {
      result = result.filter((post) => post.category === activeCategory);
    }

    if (!isLongformCategory && activeSource && activeSource.trim() !== "") {
      const activeSourceKey = normalizeHandleForFilter(activeSource);
      result = result.filter((post) => {
        const handle = typeof post.source === "string" ? post.source : post.source?.handle;
        return normalizeHandleForFilter(handle) === activeSourceKey;
      });
    }

    if (searchQuery && searchQuery.trim() !== "") {
      const lowerQuery = searchQuery.toLowerCase().trim();
      result = result.filter((post) => {
        const source = typeof post.source === "string" ? post.source : post.source;
        return [
          post.title,
          post.summary,
          post.content,
          post.originalText,
          post.referencedPost?.text,
          typeof source === "string" ? source : source?.name,
          typeof source === "string" ? source : source?.handle,
          post.longform?.title,
          post.longform?.translatedTitle,
          post.longform?.translatedContent,
        ].some((value) => textMatchesQuery(value, lowerQuery));
      });
    }

    return result;
  }, [sortedPosts, activeCategory, activeSource, searchQuery, isLongformCategory]);

  const activeSourceFilter = isLongformCategory ? "" : normalizeHandleForFilter(activeSource);
  const activeCategoryFilter =
    !isLongformCategory && activeCategory && activeCategory !== "all" ? activeCategory : "";
  const activeSearchFilter = isLongformCategory ? "" : searchQuery.trim();
  const activeFeedFilterKey = [
    activeSourceFilter,
    activeCategoryFilter,
    activeSearchFilter.toLowerCase(),
  ].join("\0");
  const hasActiveFeedFilters = Boolean(
    activeSourceFilter || activeCategoryFilter || activeSearchFilter
  );
  const activeFeedFilterMeta =
    feedFilterPageMeta?.key === activeFeedFilterKey ? feedFilterPageMeta : null;

  useEffect(() => {
    setLoadMoreFeedError("");
  }, [activeFeedFilterKey]);

  const canShowLoadMoreFeed =
    canLoadMoreFeed &&
    !isLongformCategory &&
    !emptyFeedAwaitingFetch &&
    (hasActiveFeedFilters
      ? activeFeedFilterMeta
        ? activeFeedFilterMeta.hasMore
        : feedHasMore || filteredPosts.length === 0
      : feedHasMore);

  const loadMoreStatusText = hasActiveFeedFilters
    ? activeFeedFilterMeta
      ? `已显示 ${Math.min(filteredPosts.length, activeFeedFilterMeta.total)} / ${activeFeedFilterMeta.total}`
      : `已显示 ${filteredPosts.length} 条，点击加载当前筛选结果`
    : `已加载 ${Math.min(posts.length, feedTotal)} / ${feedTotal}`;

  const handleLoadMoreFeed = useCallback(async () => {
    const canLoadCurrentView = hasActiveFeedFilters
      ? activeFeedFilterMeta
        ? activeFeedFilterMeta.hasMore
        : feedHasMore || filteredPosts.length === 0
      : feedHasMore;
    if (isLoadingMoreFeed || !canLoadCurrentView) return;

    const isFilteredLoad = hasActiveFeedFilters;
    const requestFilterKey = activeFeedFilterKey;
    const requestOffset = isFilteredLoad ? filteredPosts.length : feedOffset;
    setIsLoadingMoreFeed(true);
    setLoadMoreFeedError("");

    try {
      const params = new URLSearchParams({
        offset: String(requestOffset),
        limit: String(feedPageSize),
      });
      if (isFilteredLoad) {
        if (activeSourceFilter) params.set("source", activeSourceFilter);
        if (activeCategoryFilter) params.set("category", activeCategoryFilter);
        if (activeSearchFilter) params.set("q", activeSearchFilter);
      }
      if (newBadgeCollectionWindowRef.current) {
        params.set("fresh", "1");
      }
      const response = await fetch(`/api/feed?${params.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await response.json()) as Partial<FeedPage> & {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !data.success || !Array.isArray(data.posts)) {
        throw new Error(data.error || "加载更多失败");
      }

      setPosts((current) => dedupeNewsItemsForDisplay([...current, ...data.posts!]));
      collectNewBadgesForLoadedPosts(data.posts as NewsItem[]);
      const nextOffset =
        typeof data.nextOffset === "number"
          ? data.nextOffset
          : requestOffset + data.posts.length;
      const nextTotal = typeof data.total === "number" ? data.total : nextOffset;
      const nextHasMore = Boolean(data.hasMore);
      if (isFilteredLoad) {
        setFeedFilterPageMeta({
          key: requestFilterKey,
          total: nextTotal,
          hasMore: nextHasMore,
        });
      } else {
        setFeedOffset(nextOffset);
        setFeedTotal(nextTotal);
        setFeedHasMore(nextHasMore);
      }
    } catch (error) {
      setLoadMoreFeedError(error instanceof Error ? error.message : "加载更多失败");
    } finally {
      setIsLoadingMoreFeed(false);
    }
  }, [
    activeCategoryFilter,
    activeFeedFilterKey,
    activeFeedFilterMeta,
    activeSearchFilter,
    activeSourceFilter,
    collectNewBadgesForLoadedPosts,
    feedHasMore,
    feedOffset,
    feedPageSize,
    filteredPosts.length,
    hasActiveFeedFilters,
    isLoadingMoreFeed,
  ]);

  const isGuestDefaultFeed =
    !user &&
    isPersonalFeed &&
    initialPosts.length > 0 &&
    initialPosts.length <= 5;

  const bodyShellClass = hasShellLayout
    ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-hidden bg-white lg:overflow-x-auto"
    : "relative flex h-dvh min-h-0 w-full min-w-0 flex-col items-stretch overflow-x-hidden overflow-y-hidden bg-white lg:overflow-x-auto";

  return (
    <>
      <div data-name="Body" data-node-id="3:2330" className={bodyShellClass}>
        {!hasShellLayout && (
          <>
            <TopBar
              user={user}
              isSourcesListCollapsed={isSourcesListCollapsed}
              onToggleSourcesListCollapsed={toggleSourcesListCollapsed}
              analysisPanelOpen={showAnalysisPanel}
              onCollapseAnalysisSidebar={closeAnalysisSession}
              onOpenFetchPipelineSettings={openFetchPipelinePanel}
              onOpenPassReview={() => setShowPassReviewPanel(true)}
            />

            <div className="w-full shrink-0 pt-14">
              <div
                data-name="Horizontal Divider"
                data-node-id="3:2694"
                className="app-divider-h"
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
                  "absolute right-[-0.5px] top-0 z-[20] h-full w-[256px] overflow-hidden bg-transparent max-lg:left-0 max-lg:right-auto max-lg:fixed max-lg:top-14 max-lg:bottom-0 max-lg:z-[92] max-lg:h-auto",
                  isSourcesListCollapsed
                    ? "max-lg:pointer-events-none"
                    : "max-lg:pointer-events-auto",
                ].join(" ")}
              >
                {/* 以贴中栏的右缘为轴：折叠时 translate-x-full 向右藏入中缝侧，展开时向左铺开 */}
                <div
                  ref={sourcesSidebarPanelRef}
                  className={[
                    "flex h-full w-[256px] flex-col overflow-hidden bg-white",
                    "layout-sidebar-motion",
                    isSourcesListCollapsed
                      ? "pointer-events-none translate-x-full opacity-0 max-lg:-translate-x-full"
                      : "pointer-events-auto translate-x-0 opacity-100",
                  ].join(" ")}
                  aria-hidden={isSourcesListCollapsed}
                >
                  {!isSourcesListCollapsed ? (
                    <SourcesList
                      sources={sourcesState}
                      currentSource={activeSource}
                      onSourceSelect={handleSourceSelect}
                      onAddSource={handleAddBloggerSource}
                      fetchingSourceIds={fetchingSourceIds}
                      user={user}
                      isCollapsed={false}
                      onToggleCollapse={collapseSourcesList}
                    />
                  ) : null}
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
                "main-content-scroll relative z-0 box-border flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col items-stretch overflow-x-hidden overflow-y-auto bg-white px-4 pb-5 sm:px-6 lg:max-w-none lg:flex-none lg:px-8 lg:pb-[24px]",
              ].join(" ")}
              onScroll={handleMainContentScroll}
            >
              <div className="pt-5 lg:pt-[24px]">
                <SiteHeader stats={stats} />
              </div>

              <div className="h-[40px] w-full shrink-0" aria-hidden />

              <div
                id="layout-category-filter"
                data-name="Tab"
                data-node-id="37:4718"
                className="sticky top-0 z-10 flex w-full shrink-0 flex-col items-stretch bg-white"
              >
                <div
                  data-name="HorizontalBorder"
                  data-node-id="37:4719"
                  className="app-divider-border-b flex h-[46px] min-h-[46px] w-full shrink-0 flex-col items-stretch"
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
                  {isLongformCategory && longformLoading && filteredPosts.length === 0 ? (
                    <LongformStatusSection
                      title="正在加载长文"
                      detail="正在读取近期整理的深度内容。"
                    />
                  ) : isLongformCategory && longformError && filteredPosts.length === 0 ? (
                    <LongformStatusSection
                      title="长文加载失败"
                      detail={longformError}
                      actionLabel="重试"
                      onAction={loadLongformPosts}
                    />
                  ) : isLongformCategory ? (
                    <>
                      <LongformModule
                        posts={filteredPosts}
                        onAddArticle={() => setShowAddLongformModal(true)}
                        analysisActivePostId={analysisPostId}
                        onAnalysisToggle={handleAnalysisToggle}
                        previewPostIds={longformPreviewIds}
                        fullLoadingPostIds={longformFullLoadingIds}
                        fullErrorByPostId={longformFullErrorById}
                        onRequestFullArticle={loadFullLongformPost}
                        showFloatingToc={isSourcesListCollapsed}
                      />
                      {(longformHasMore || longformLoadMoreError) ? (
                        <section className="flex w-full min-w-0 flex-col items-center gap-3 px-4 py-8">
                          {longformHasMore ? (
                            <button
                              type="button"
                              onClick={loadMoreLongformPosts}
                              disabled={longformLoadingMore}
                              className="btn-primary btn-press inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium disabled:cursor-wait disabled:opacity-60"
                            >
                              {longformLoadingMore ? "加载中..." : "加载更多长文"}
                            </button>
                          ) : null}
                          {longformTotal > 0 ? (
                            <p className="m-0 text-[12px] leading-5 text-[#99a1af]">
                              已显示 {Math.min(filteredPosts.length, longformTotal)} / {longformTotal}
                            </p>
                          ) : null}
                          {longformLoadMoreError ? (
                            <p className="m-0 text-[12px] leading-5 text-primary-600">
                              {longformLoadMoreError}
                            </p>
                          ) : null}
                        </section>
                      ) : null}
                    </>
                  ) : (
                    <NewsList
                      posts={filteredPosts}
                      bookmarkedIds={bookmarkedIds}
                      bookmarkPendingIds={bookmarkPendingIds}
                      onBookmarkToggle={toggleBookmark}
                      passPendingIds={passPendingIds}
                      onPassPost={handlePassPost}
                      newPostIds={newBadgePostIds}
                      analysisActivePostId={analysisPostId}
                      onAnalysisToggle={handleAnalysisToggle}
                      emptyFeedAwaitingFetch={emptyFeedAwaitingFetch}
                    />
                  )}
                  {!isLongformCategory && (canShowLoadMoreFeed || loadMoreFeedError) ? (
                    <section className="flex w-full min-w-0 flex-col items-center gap-3 px-4 py-8">
                      {canShowLoadMoreFeed ? (
                        <button
                          type="button"
                          onClick={handleLoadMoreFeed}
                          disabled={isLoadingMoreFeed}
                          className="btn-primary btn-press inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium disabled:cursor-wait disabled:opacity-60"
                        >
                          {isLoadingMoreFeed ? "加载中..." : "加载更多"}
                        </button>
                      ) : null}
                      <p className="m-0 text-[12px] leading-5 text-[#99a1af]">
                        {loadMoreStatusText}
                      </p>
                      {loadMoreFeedError ? (
                        <p className="m-0 text-[12px] leading-5 text-primary-600">
                          {loadMoreFeedError}
                        </p>
                      ) : null}
                    </section>
                  ) : null}
                  {isGuestDefaultFeed && !isLongformCategory && (
                    <section
                      className="mt-8 w-full min-w-0 pt-8"
                      aria-label="登录以解锁更多内容"
                    >
                      <div className="mx-auto flex w-full max-w-md min-w-0 flex-col items-center gap-6 px-4 pb-24 text-center sm:max-w-lg sm:px-0 sm:pb-32">
                        <div
                          className="flex items-center justify-center gap-3"
                          role="presentation"
                        >
                          <span className="app-divider-h-segment w-10 sm:w-12" aria-hidden />
                          <span className="shrink-0 font-mono text-[12px] font-medium uppercase leading-[18px] tracking-[0.08em] text-[#99a1af]">
                            部分内容需登录
                          </span>
                          <span className="app-divider-h-segment w-10 sm:w-12" aria-hidden />
                        </div>
                        <div className="flex flex-col gap-2">
                          <p className="m-0 text-[16px] font-semibold leading-6 tracking-[-0.35px] text-[#101828] sm:text-[17px] sm:leading-7">
                            登录查看完整信息流
                          </p>
                          <p className="m-0 text-[13px] font-normal leading-5 text-[#6a7282]">
                            登录 uAI News，获取解码与个性化洞察。
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={openLogin}
                          className="btn-press inline-flex h-8 items-center justify-center rounded-[4px] bg-[#0055FF] px-4 text-xs font-medium text-white transition-colors hover:bg-[#0046CC]"
                        >
                          登录
                        </button>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>

            {!isSourcesListCollapsed ? (
              <button
                type="button"
                className="source-drawer-backdrop-enter pointer-events-auto fixed bottom-0 right-0 top-14 z-[15] bg-black/35 max-lg:left-[256px] lg:hidden"
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
                <>
                  <div
                    className={[
                      "absolute left-0 top-0 z-[20] h-full overflow-hidden max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-14 max-lg:z-[91] max-lg:h-auto max-lg:w-full",
                      "lg:w-[336px]",
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
                        post={analysisPost}
                        analysis={analysisCache[analysisPostId] ?? null}
                        isLoading={analysisLoadingPostId === analysisPostId}
                        analysisError={analysisErrorByPost[analysisPostId] ?? null}
                        onRetryAnalysis={retryInsightAnalysis}
                        isBookmarked={analysisPost ? bookmarkedIds.has(analysisPost.id) : false}
                        bookmarkPending={analysisPost ? bookmarkPendingIds.has(analysisPost.id) : false}
                        onBookmarkToggle={toggleBookmark}
                        longformPending={analysisPost ? longformActionPendingIds.has(analysisPost.id) : false}
                        onLongformExtract={handleLongformExtractFromPost}
                      />
                    </div>
                  </div>
                </>
              ) : null}
            </div>
        </div>
      </div>

      {!isSourcesListCollapsed ? (
        <button
          type="button"
          className="fixed bottom-0 top-14 z-[25] hidden cursor-default border-0 bg-transparent p-0 lg:block"
          style={{
            left: 0,
            width: `max(0px, calc((100% - ${MAIN_CENTER_TRACK_PX}px) / 2 - ${SOURCES_PANEL_WIDTH_PX}px))`,
          }}
          aria-label="折叠信息源列表"
          onClick={() => setIsSourcesListCollapsed(true)}
        />
      ) : null}

      {showAnalysisPanel ? (
        <button
          type="button"
          className="fixed bottom-0 top-14 z-[25] hidden cursor-default border-0 bg-transparent p-0 lg:block"
          style={{
            left: `calc((100% - ${MAIN_CENTER_TRACK_PX}px) / 2 + ${MAIN_CENTER_TRACK_PX}px + ${ANALYSIS_PANEL_WIDTH_PX}px)`,
            right: 0,
          }}
          aria-label="折叠解读侧栏"
          onClick={closeAnalysisSession}
        />
      ) : null}

      {sourceActivity ? (
        <SourceActivityNotice
          title={sourceActivity.title}
          detail={sourceActivity.detail}
          tone={sourceActivity.tone}
          isLeaving={sourceActivity.isLeaving}
        />
      ) : null}

      {showAddSourceModal ? (
        <AddSourceModal
        isOpen={showAddSourceModal}
        onClose={() => setShowAddSourceModal(false)}
        recommendedSources={recommendedState}
        onRecommendedChange={handleRecommendedChange}
        subscribedIds={subscribedIds}
        subscribedHandles={subscribedHandles}
        onSubscribe={handleRecommendSubscribe}
        onSourceAdded={({ source: added, taskId }) => {
          if (user) {
            const normalizedHandle = added.handle.toLowerCase();
            const sourceType: Source["sourceType"] =
              added.sourceType === "media" || added.sourceType === "academic"
                ? added.sourceType
                : "blogger";
            setSourcesState((current) => {
              if (
                current.some(
                  (source) =>
                    source.id === added.id || source.handle.toLowerCase() === normalizedHandle
                )
              ) {
                return current;
              }
              return [
                ...current,
                {
                  id: added.id,
                  handle: added.handle,
                  name: added.name,
                  url: added.url,
                  avatar: added.avatar,
                  description: added.description,
                  postCount: 0,
                  sourceType,
                },
              ];
            });
            setRecommendedState((current) =>
              current.filter(
                (source) =>
                  source.id !== added.id && source.handle.toLowerCase() !== normalizedHandle
              )
            );
            if (taskId && added.id) {
              startSourceFetchPolling(added.id, taskId, added.handle);
            } else {
              showSourceActivity({
                title: `已添加 @${added.handle.replace(/^@+/, "")}`,
                detail: "信息源已保存，正在同步订阅列表。",
                tone: "success",
              });
            }
            void refreshSubscribedClientState(
              taskId ? { notifyFeedPostsSynced: false } : undefined
            );
            return;
          }
          void fetch(`/api/recommended-sources?limit=${RECOMMENDED_SIDEBAR_LIMIT}`, {
            cache: "no-store",
            credentials: "same-origin",
          })
            .then((res) => res.json())
            .then((data: { success?: boolean; sources?: Source[] }) => {
              if (data.success && Array.isArray(data.sources)) {
                setRecommendedState(data.sources);
              }
            })
            .catch(() => {});
        }}
        />
      ) : null}

      {showAddLongformModal ? (
        <AddLongformModal
          isOpen={showAddLongformModal}
          onClose={() => setShowAddLongformModal(false)}
          onImported={handleLongformImported}
        />
      ) : null}

      {showAuthPrompt ? (
        <AuthPromptModal isOpen={showAuthPrompt} onClose={() => setShowAuthPrompt(false)} />
      ) : null}

      {hasOpenedPassReviewPanel ? (
        <PassedPostsReviewPanel
          isOpen={showPassReviewPanel}
          onClose={() => setShowPassReviewPanel(false)}
          user={user}
          onPromoted={() =>
            void refreshSubscribedClientState(
              refreshStartedAtRef.current == null ? undefined : { notifyFeedPostsSynced: false }
            )
          }
        />
      ) : null}

      {hasOpenedFetchPipelinePanel ? (
        <FetchPipelinePanel
          isOpen={fetchPipelinePanelOpen}
          onClose={closeFetchPipelinePanel}
          taskId={taskId}
          task={task}
          user={user}
          onRequestAddSource={() => {
            setShowAddSourceModal(true);
            setIsSourcesListCollapsed(false);
          }}
        />
      ) : null}
    </>
  );
}
