"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { NewsItem } from "@/lib/types";
import { normalizeHandleForFilter, type FeedPage, type FeedPageFilters } from "@/lib/feed-pagination";

type PageMeta = Pick<FeedPage, "nextOffset" | "total" | "hasMore">;
type Options = {
  initialPage: PageMeta;
  initialPosts: NewsItem[];
  posts: NewsItem[];
  setPosts: Dispatch<SetStateAction<NewsItem[]>>;
  filters: FeedPageFilters;
  filteredPosts: NewsItem[];
  pageSize: number;
  enabled: boolean;
  prioritizeRecentlyFetched: () => boolean;
  onPostsLoaded: (posts: NewsItem[]) => void;
};

/** Server offsets count consumed rows, never the number of deduplicated UI cards. */
export function useFeedPagination({ initialPage, initialPosts, posts, setPosts, filters, filteredPosts,
  pageSize, enabled, prioritizeRecentlyFetched, onPostsLoaded }: Options) {
  const [page, setPage] = useState(initialPage);
  const [filteredPage, setFilteredPage] = useState<(PageMeta & { key: string; matchedIds: Set<string> }) | null>(null);
  const [isLoadingMoreFeed, setLoading] = useState(false);
  const [loadMoreFeedError, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const source = normalizeHandleForFilter(filters.sourceHandle);
  const category = filters.category === "all" ? "" : filters.category?.trim() || "";
  const query = filters.searchQuery?.trim() || "";
  const key = [source, category, query.toLowerCase()].join("\0");
  const keyRef = useRef(key);
  keyRef.current = key;
  const hasFilters = Boolean(source || category || query);
  const activePage = filteredPage?.key === key ? filteredPage : null;
  const matchedPostIds = activePage?.matchedIds;
  const visibleIds = new Set(filteredPosts.map((post) => post.id));
  for (const post of posts) if (matchedPostIds?.has(post.id)) visibleIds.add(post.id);
  const filteredCount = visibleIds.size;
  const hasMore = hasFilters ? (activePage?.hasMore ?? (page.hasMore || filteredCount === 0)) : page.hasMore;

  const cancel = useCallback(() => {
    pending.current?.abort();
    pending.current = null;
  }, []);
  useEffect(() => {
    cancel();
    setLoading(false);
    setError("");
    return cancel;
  }, [cancel, key, enabled]);

  const handleFeedPageSynced = useCallback((next: PageMeta) => {
    cancel();
    setPage(next);
    setFilteredPage(null);
    setLoading(false);
    setError("");
  }, [cancel]);
  const handlePostHidden = useCallback(() => {
    cancel();
    // Hiding changes the server result set (and potentially its ranking).
    // Re-read from zero and merge identities so no shifted row is skipped.
    setPage((current) => ({ total: Math.max(0, current.total - 1), nextOffset: 0, hasMore: current.total > 1 }));
    setFilteredPage(null);
    setLoading(false);
    setError("");
  }, [cancel]);
  useEffect(() => {
    handleFeedPageSynced({ nextOffset: initialPage.nextOffset, total: initialPage.total, hasMore: initialPage.hasMore });
  }, [handleFeedPageSynced, initialPosts, initialPage.nextOffset, initialPage.total, initialPage.hasMore]);

  const handleLoadMoreFeed = useCallback(async () => {
    if (!enabled || pending.current || !hasMore) return;
    const controller = new AbortController();
    pending.current = controller;
    // A newly selected filter always starts at zero: a truncated preview may
    // omit the matching text, and display deduplication can remove visible rows.
    const offset = hasFilters ? activePage?.nextOffset ?? 0 : page.nextOffset;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ offset: String(offset), limit: String(pageSize) });
      if (source) params.set("source", source);
      if (category) params.set("category", category);
      if (query) params.set("q", query);
      if (prioritizeRecentlyFetched()) params.set("fresh", "1");
      const response = await fetch(`/api/feed?${params}`, {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.posts) ||
        !Number.isSafeInteger(data.nextOffset) || !Number.isSafeInteger(data.total) ||
        data.nextOffset < offset || (data.hasMore && data.nextOffset <= offset)) {
        throw new Error(data.error || "加载更多失败");
      }
      if (controller.signal.aborted || keyRef.current !== key) return;
      // The service deduplicates full text. Only merge identities here: running
      // semantic dedupe again on truncated previews can discard unrelated items.
      setPosts((current) => {
        const byId = new Map(current.map((post) => [post.id, post]));
        for (const post of data.posts as NewsItem[]) if (!byId.has(post.id)) byId.set(post.id, post);
        return [...byId.values()];
      });
      onPostsLoaded(data.posts);
      const next = { nextOffset: data.nextOffset, total: data.total, hasMore: Boolean(data.hasMore) };
      if (hasFilters) setFilteredPage((current) => ({ ...next, key,
        matchedIds: new Set([...(current?.key === key ? current.matchedIds : []), ...data.posts.map((post: NewsItem) => post.id)]),
      }));
      else setPage(next);
    } catch (error) {
      if (!controller.signal.aborted && keyRef.current === key) setError(error instanceof Error ? error.message : "加载更多失败");
    } finally {
      if (pending.current === controller) { pending.current = null; setLoading(false); }
    }
  }, [enabled, hasMore, hasFilters, activePage, page.nextOffset, pageSize, source, category,
    query, prioritizeRecentlyFetched, key, setPosts, onPostsLoaded]);

  const regularCount = posts.reduce((count, post) => count + Number(!post.longform?.translatedContent), 0);
  const loadMoreStatusText = hasFilters
    ? activePage ? `已显示 ${Math.min(filteredCount, activePage.total)} / ${activePage.total}`
      : `已显示 ${filteredCount} 条，点击加载当前筛选结果`
    : `已加载 ${Math.min(regularCount, page.total)} / ${page.total}`;
  return { handleFeedPageSynced, handlePostHidden, handleLoadMoreFeed, isLoadingMoreFeed, loadMoreFeedError,
    loadMoreStatusText, matchedPostIds, canShowLoadMoreFeed: enabled && hasMore };
}
