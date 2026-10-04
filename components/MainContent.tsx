"use client";

import { useState, useMemo, useCallback, useEffect, useRef, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { NewsItem } from "@/lib/types";
import { RECOMMENDED_SIDEBAR_LIMIT } from "@/lib/feed-quality";
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
import SourceActivityNotice from "./SourceActivityNotice";
import { useSourceActivity } from "@/hooks/useSourceActivity";

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
const AuthPromptModal = dynamic(() => import("./AuthPromptModal"), { ssr: false });
const AnalysisPanel = dynamic(() => import("./AnalysisPanel"), { ssr: false });
const PassedPostsReviewPanel = dynamic(() => import("./PassedPostsReviewPanel"), {
  ssr: false,
  loading: () => <ModalLoadingFallback title="不感兴趣的内容" large />,
});
const ReadingPreferencesPanel = dynamic(() => import("./ReadingPreferencesPanel"), {
  ssr: false,
  loading: () => <ModalLoadingFallback title="阅读偏好" large />,
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
import { useRefreshTask } from "@/hooks/useRefreshTask";
import { useOptionalHomeLayout } from "@/components/HomeLayoutContext";
import { useLongformFeed, LONGFORM_CATEGORY } from "@/hooks/useLongformFeed";
import { useFeedPagination } from "@/hooks/useFeedPagination";
import { useFeedBadges } from "@/hooks/useFeedBadges";
import { useFeedScroll } from "@/hooks/useFeedScroll";
import { useInsightPanel } from "@/hooks/useInsightPanel";
import { compareNewsItemsForFeedDisplay } from "@/lib/feed-sort";
import { HOME_FEED_PAGE_SIZE, filterFeedPosts, type FeedPage } from "@/lib/feed-pagination";

/** Figma 侧栏宽 — 与画板列宽一致 */
const SOURCES_PANEL_WIDTH_PX = 256;
const ANALYSIS_PANEL_WIDTH_PX = 336;
/** 中栏 800px + 左右 1px 分隔线，与 TopBar / grid 列定义一致 */
const MAIN_CENTER_TRACK_PX = 802;

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

import type { SourceListItem as Source } from "@/lib/types";

const EMPTY_SOURCES: Source[] = [];

type MainContentProps = {
  feedUnavailable?: boolean;
  canManage?: boolean;
  initialPosts: NewsItem[];
  sources: Source[];                    // 已订阅信息源列表
  recommendedSources?: Source[];        // 推荐关注的信息源
  totalCount: number;
  stats: import("@/lib/stats").Stats;
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
  feedUnavailable = false,
  canManage = false,
  initialPosts,
  sources,
  recommendedSources = EMPTY_SOURCES,
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
  const router = useRouter();
  const [retryingFeed, startFeedRetry] = useTransition();
  const retryFeed = useCallback(() => startFeedRetry(() => router.refresh()), [router]);
  const optionalShell = useOptionalHomeLayout();
  const openLogin = useOpenLogin();
  const [hasHydrated, setHasHydrated] = useState(false);
  const [localFetchPipelinePanelOpen, setLocalFetchPipelinePanelOpen] = useState(false);
  const [hasOpenedFetchPipelinePanel, setHasOpenedFetchPipelinePanel] = useState(false);
  const [showPassReviewPanel, setShowPassReviewPanel] = useState(false);
  const hasShellLayout = Boolean(useShellLayout && optionalShell);
  const shellLayoutReady = hasHydrated && hasShellLayout;

  useEffect(() => {
    setHasHydrated(true);
  }, []);

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
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [activeSource, setActiveSource] = useState<string>("");
  const [posts, setPosts] = useState<NewsItem[]>(initialPosts);
  const preserveClientFeedUntilRef = useRef(0);
  const [passPendingIds, setPassPendingIds] = useState<Set<string>>(() => new Set());
  const [sourcesState, setSourcesState] = useState<Source[]>(sources);
  const [recommendedState, setRecommendedState] = useState<Source[]>(recommendedSources);
  const [fetchingSourceIds, setFetchingSourceIds] = useState<Set<string>>(() => new Set());
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  // Figma 默认态没有“订阅引导大卡片”遮挡首页主内容
  // 非个性化 feed 时，默认直接展示推荐推文列表
  const [showRecommendedPosts, setShowRecommendedPosts] = useState(!isPersonalFeed);

  const passPendingIdsRef = useRef<Set<string>>(new Set());

  const handleNeedAuth = useCallback(() => setShowAuthPrompt(true), []);

  const {
    newBadgePostIds, newBadgeSortPostIds, setNewBadgePostIds, refreshStartedAtRef,
    newBadgeCollectionWindowRef, clearRefreshNewBadgeContext, beginNewBadgeCollection,
    collectNewBadgesForLoadedPosts, commitNewBadgesFromPosts, dismissNewBadge,
  } = useFeedBadges();

  const {
    analysisOpen, analysisPostId, analysisCache, analysisLoadingPostId,
    analysisErrorByPost, showAnalysisPanel, analysisSlidesOpen,
    closeAnalysisSession, handleAnalysisToggle, retryInsightAnalysis,
  } = useInsightPanel(posts, dismissNewBadge);

  const { mainScrollRef, sourcesSidebarPanelRef, analysisSidebarPanelRef, handleMainContentScroll } =
    useFeedScroll(isSourcesListCollapsed, analysisSlidesOpen);

  const { sourceActivity, showSourceActivity } = useSourceActivity();

  const revealLongform = useCallback(() => {
    setActiveCategory(LONGFORM_CATEGORY);
    setShowRecommendedPosts(true);
  }, []);
  const {
    longformLoading, longformLoadingMore, longformLoadMoreError, longformHasMore, longformTotal, loadMoreLongformPosts, longformError, longformPreviewIds, longformFullLoadingIds,
    longformFullErrorById, longformActionPendingIds, loadLongformPosts,
    loadFullLongformPost, handleLongformExtractFromPost,
  } = useLongformFeed({ setPosts, activeCategory, revealLongform, notify: showSourceActivity });

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
          detail: "订阅已保存，可稍后点击「更新」重试。",
          tone: "error",
        },
        6200
      );
    },
    [beginNewBadgeCollection, clearRefreshNewBadgeContext, posts, showSourceActivity]
  );

  /** Synchronize new server props while retaining already opened full articles. */
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
        return Array.from(byId.values());
      }

      const byId = new Map(initialPosts.map((post) => [post.id, post]));
      for (const post of current) {
        if (post.longform?.translatedContent && !byId.has(post.id)) {
          byId.set(post.id, post);
        }
      }
      return Array.from(byId.values());
    });
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

  const sortedPosts = useMemo(() => {
    return [...posts].sort((a, b) => {
        const newBadgeDiff =
          Number(newBadgeSortPostIds.has(b.id)) - Number(newBadgeSortPostIds.has(a.id));
        if (newBadgeDiff !== 0) return newBadgeDiff;
        return compareNewsItemsForFeedDisplay(a, b);
      });
  }, [newBadgeSortPostIds, posts]);

  const analysisPost = useMemo(
    () => (analysisPostId ? posts.find((p) => p.id === analysisPostId) ?? null : null),
    [posts, analysisPostId]
  );

  const isLongformCategory = activeCategory === LONGFORM_CATEGORY;

  const locallyFilteredPosts = useMemo(() => filterFeedPosts(
    sortedPosts.filter((post) => isLongformCategory
      ? Boolean(post.longform?.translatedContent)
      : !post.longform?.translatedContent),
    { category: isLongformCategory ? undefined : activeCategory,
      sourceHandle: isLongformCategory ? undefined : activeSource }
  ), [sortedPosts, activeCategory, activeSource, isLongformCategory]);

  const prioritizeRecentlyFetched = useCallback(() => Boolean(newBadgeCollectionWindowRef.current), []);
  const {
    handleFeedPageSynced, handlePostHidden, handleLoadMoreFeed, isLoadingMoreFeed, loadMoreFeedError,
    loadMoreStatusText, matchedPostIds, canShowLoadMoreFeed,
  } = useFeedPagination({
    initialPage: { nextOffset: initialFeedOffset, total: initialFeedTotal, hasMore: initialFeedHasMore },
    initialPosts, posts, setPosts,
    filters: { sourceHandle: isLongformCategory ? undefined : activeSource,
      category: isLongformCategory ? undefined : activeCategory },
    filteredPosts: locallyFilteredPosts, pageSize: feedPageSize,
    enabled: canLoadMoreFeed && !isLongformCategory && !feedUnavailable && passPendingIds.size === 0,
    prioritizeRecentlyFetched, onPostsLoaded: collectNewBadgesForLoadedPosts,
  });

  const filteredPosts = useMemo(() => {
    if (isLongformCategory || !matchedPostIds?.size) return locallyFilteredPosts;
    const localIds = new Set(locallyFilteredPosts.map((post) => post.id));
    // A server match can occur beyond the shortened text sent in a card preview.
    return sortedPosts.filter((post) => localIds.has(post.id) || matchedPostIds.has(post.id));
  }, [isLongformCategory, locallyFilteredPosts, matchedPostIds, sortedPosts]);

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

  const onRefreshComplete = useCallback(() => {
    preserveClientFeedUntilRef.current = Date.now() + 30_000;
    void refreshSubscribedClientState({ prioritizeRecentlyFetched: true }).then((page) => {
      if (!page?.posts) {
        preserveClientFeedUntilRef.current = 0;
        clearRefreshNewBadgeContext();
      }
    });
  }, [clearRefreshNewBadgeContext, refreshSubscribedClientState]);

  const onRefreshStart = useCallback(() => {
    beginNewBadgeCollection(Date.now(), new Set(posts.map((post) => post.id)), "replace");
    setNewBadgePostIds(new Set());
  }, [beginNewBadgeCollection, posts, setNewBadgePostIds]);
  const { taskId, task, isFetchBusy, handleRefresh, handleTaskUpdate, handleTaskComplete } = useRefreshTask({
    authenticated: Boolean(user), onNeedAuth: handleNeedAuth, onStart: onRefreshStart,
    onCancel: clearRefreshNewBadgeContext, onComplete: onRefreshComplete,
  });

  const handleAddSource = useCallback((_type: 'blogger' | 'media' | 'academic') => {
    if (!user) { openLogin(); return; }
    setShowAddSourceModal(true);
    setIsSourcesListCollapsed(false);
  }, [setIsSourcesListCollapsed, user, openLogin]);
  const handleAddBloggerSource = useCallback(() => handleAddSource("blogger"), [handleAddSource]);
  const handleSourceSelect = useCallback((handle?: string) => {
    setActiveSource(handle || "");
  }, []);
  const toggleSourcesListCollapsed = useCallback(() => {
    setIsSourcesListCollapsed((v) => !v);
  }, [setIsSourcesListCollapsed]);


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

  const handlePassPost = useCallback(
    async (post: NewsItem) => {
      if (!user) {
        setShowAuthPrompt(true);
        return;
      }
      if (passPendingIdsRef.current.has(post.id)) return;

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
          throw new Error(data.error || "隐藏失败，请稍后重试。");
        }
        handlePostHidden();
        showSourceActivity(
          {
            title: "已隐藏这条内容",
            detail: "可在阅读偏好中恢复。",
            tone: "success",
          },
          3200
        );
      } catch (error) {
        setPosts((current) => current.some((item) => item.id === post.id) ? current : [...current, post]);
        showSourceActivity(
          {
            title: "隐藏失败",
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
    [analysisPostId, closeAnalysisSession, handlePostHidden, showSourceActivity, user]
  );

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
                      isCollapsed={false}
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
                <SiteHeader stats={stats} unavailable={feedUnavailable} />
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
                      analysisActivePostId={analysisPostId}
                      onAnalysisToggle={handleAnalysisToggle}
                      previewPostIds={longformPreviewIds}
                      fullLoadingPostIds={longformFullLoadingIds}
                      fullErrorByPostId={longformFullErrorById}
                      onRequestFullArticle={loadFullLongformPost}
                      showFloatingToc={isSourcesListCollapsed}
                    />
                      {(longformHasMore || longformLoadMoreError) && (
                        <section className="flex w-full min-w-0 flex-col items-center gap-3 px-4 py-8">
                          <button type="button" onClick={loadMoreLongformPosts} disabled={longformLoadingMore}
                            className="btn-primary btn-press inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium disabled:cursor-wait disabled:opacity-60">
                            {longformLoadingMore ? "加载中..." : "加载更多长文"}
                          </button>
                          <p className="m-0 text-[12px] leading-5 text-[#99a1af]">已显示 {Math.min(filteredPosts.length, longformTotal)} / {longformTotal}</p>
                          {longformLoadMoreError && <p className="m-0 text-[12px] leading-5 text-primary-600">{longformLoadMoreError}</p>}
                        </section>
                      )}
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
                      emptyStatus={isFetchBusy || fetchingSourceIds.size > 0 ? "updating" : feedUnavailable ? "unavailable" : activeCategory || activeSource ? "filtered" : "empty"}
                      onRetry={retryFeed}
                      retrying={retryingFeed}
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
                        onLongformExtract={user ? handleLongformExtractFromPost : undefined}
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

      {showAuthPrompt ? (
        <AuthPromptModal isOpen={showAuthPrompt} onClose={() => setShowAuthPrompt(false)} />
      ) : null}

      {showPassReviewPanel ? (
        <PassedPostsReviewPanel
          key={`hidden:${user?.id ?? "guest"}`}
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

      {hasOpenedFetchPipelinePanel || fetchPipelinePanelOpen ? (
        <ReadingPreferencesPanel
          key={`preferences:${user?.id ?? "guest"}`}
          isOpen={fetchPipelinePanelOpen}
          onClose={closeFetchPipelinePanel}
          user={user}
          canManage={canManage}
          sources={sourcesState}
          onLogin={() => { closeFetchPipelinePanel(); openLogin(); }}
          onReviewHidden={() => { closeFetchPipelinePanel(); setShowPassReviewPanel(true); }}
          onChanged={() => { void refreshSubscribedClientState(); router.refresh(); }}
        />
      ) : null}
    </>
  );
}
