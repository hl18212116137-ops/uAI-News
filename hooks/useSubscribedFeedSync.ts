"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { AuthUser } from "@/lib/auth";
type User = AuthUser;
import type { NewsItem } from "@/lib/types";
import { RECOMMENDED_SIDEBAR_LIMIT } from "@/lib/feed-quality";
import { HOME_FEED_PAGE_SIZE, type FeedPage } from "@/lib/feed-pagination";
import { watchTask } from "@/lib/task-polling";
import type { SubscriptionMutateSuccessPayload } from "@/hooks/useSubscription";

export type { SourceListItem as SubscribedSourceRow } from "@/lib/types";
import type { SourceListItem as SubscribedSourceRow } from "@/lib/types";

type SetSources = Dispatch<SetStateAction<SubscribedSourceRow[]>>;
type SetRecommended = Dispatch<SetStateAction<SubscribedSourceRow[]>>;
type SetPosts = Dispatch<SetStateAction<NewsItem[]>>;
type SetFetchingIds = Dispatch<SetStateAction<Set<string>>>;

type RefreshSubscribedClientStateOptions = {
  notifyFeedPostsSynced?: boolean;
  prioritizeRecentlyFetched?: boolean;
};

export type SourceFetchEvent = {
  sourceId: string;
  sourceHandle?: string;
  taskId: string;
  status: "started" | "completed" | "failed";
};

/**
 * 订阅/抓取后的增量同步：me/subscribed-sources、recommended、feed + task-status 轮询
 */
export function useSubscribedFeedSync(
  user: User | null,
  setSourcesState: SetSources,
  setRecommendedState: SetRecommended,
  setPosts: SetPosts,
  setFetchingSourceIds: SetFetchingIds,
  onSourceFetchEvent?: (event: SourceFetchEvent) => void,
  onFeedPageSynced?: (page: Pick<FeedPage, "nextOffset" | "total" | "hasMore">) => void,
  onFeedPostsSynced?: (page: FeedPage) => void
) {
  const fetchPollsRef = useRef<Map<string, { stop: () => void; sourceId: string }>>(new Map());
  const syncRequestRef = useRef<AbortController | null>(null);
  const onSourceFetchEventRef = useRef(onSourceFetchEvent);
  const onFeedPageSyncedRef = useRef(onFeedPageSynced);
  const onFeedPostsSyncedRef = useRef(onFeedPostsSynced);

  useEffect(() => {
    onSourceFetchEventRef.current = onSourceFetchEvent;
  }, [onSourceFetchEvent]);

  useEffect(() => {
    onFeedPageSyncedRef.current = onFeedPageSynced;
  }, [onFeedPageSynced]);

  useEffect(() => {
    onFeedPostsSyncedRef.current = onFeedPostsSynced;
  }, [onFeedPostsSynced]);

  useEffect(
    () => () => {
      syncRequestRef.current?.abort();
      fetchPollsRef.current.forEach(({ stop }) => stop());
      fetchPollsRef.current.clear();
    },
    [user?.id]
  );

  const refreshSubscribedClientState = useCallback(
    async (options?: RefreshSubscribedClientStateOptions): Promise<FeedPage | null> => {
      if (!user) return null;
      syncRequestRef.current?.abort();
      const controller = new AbortController();
      syncRequestRef.current = controller;
      try {
        const feedParams = new URLSearchParams({
          offset: "0",
          limit: String(HOME_FEED_PAGE_SIZE),
        });
        if (options?.prioritizeRecentlyFetched) {
          feedParams.set("fresh", "1");
        }
        const [metaRes, recRes, feedRes] = await Promise.all([
          fetch("/api/me/subscribed-sources", { cache: "no-store", credentials: "same-origin", signal: controller.signal }),
          fetch(`/api/recommended-sources?limit=${RECOMMENDED_SIDEBAR_LIMIT}&random=1`, {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          }),
          fetch(`/api/feed?${feedParams.toString()}`, {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          }),
        ]);
        const [meta, rec, feed] = await Promise.all([metaRes.json(), recRes.json(), feedRes.json()]);
        if (controller.signal.aborted) return null;
        if (metaRes.ok && meta.success && Array.isArray(meta.sources)) setSourcesState(meta.sources);
        if (recRes.ok && rec.success && Array.isArray(rec.sources)) setRecommendedState(rec.sources);
        let syncedFeedPage: FeedPage | null = null;
        if (feedRes.ok && feed.success && Array.isArray(feed.posts)) {
          const feedPosts = feed.posts as NewsItem[];
          syncedFeedPage = {
            posts: feedPosts,
            nextOffset:
              typeof feed.nextOffset === "number" ? feed.nextOffset : feedPosts.length,
            total: typeof feed.total === "number" ? feed.total : feedPosts.length,
            hasMore: Boolean(feed.hasMore),
          };
          const nextFeedPosts = syncedFeedPage.posts;
          setPosts((current) => [...nextFeedPosts, ...current.filter((post) =>
            post.longform?.translatedContent && !nextFeedPosts.some((next) => next.id === post.id))]);
          onFeedPageSyncedRef.current?.(syncedFeedPage);
          if (options?.notifyFeedPostsSynced !== false) {
            onFeedPostsSyncedRef.current?.(syncedFeedPage);
          }
        }
        return syncedFeedPage;
      } catch (e) {
        if (!controller.signal.aborted) console.error("[useSubscribedFeedSync] refreshSubscribedClientState", e);
        return null;
      }
    },
    [user, setSourcesState, setRecommendedState, setPosts]
  );

  const startSourceFetchPolling = useCallback(
    (sourceId: string, taskId: string, sourceHandle?: string) => {
      if (fetchPollsRef.current.has(taskId)) return;
      setFetchingSourceIds((prev) => new Set(prev).add(sourceId));
      onSourceFetchEventRef.current?.({
        sourceId,
        sourceHandle,
        taskId,
        status: "started",
      });

      const finish = (status: "completed" | "failed") => {
        fetchPollsRef.current.delete(taskId);
        if (![...fetchPollsRef.current.values()].some((poll) => poll.sourceId === sourceId)) {
          setFetchingSourceIds((current) => { const next = new Set(current); next.delete(sourceId); return next; });
        }
        onSourceFetchEventRef.current?.({ sourceId, sourceHandle, taskId, status });
        if (status === "completed") void refreshSubscribedClientState({ prioritizeRecentlyFetched: true });
      };
      const stop = watchTask(taskId, (task) => {
        if (task.status === "completed") finish("completed");
        else if (task.status === "failed" || task.status === "cancelled") finish("failed");
      }, { intervalMs: 2000, onError: () => finish("failed") });
      fetchPollsRef.current.set(taskId, { stop, sourceId });
    },
    [refreshSubscribedClientState, setFetchingSourceIds]
  );

  const handleSubscriptionSynced = useCallback(
    async (payload: SubscriptionMutateSuccessPayload) => {
      if (!user) return;
      if (payload.action === "subscribe" && payload.fetchTaskId) {
        const fetchSourceId = payload.resolvedSourceId || payload.sourceId;
        startSourceFetchPolling(fetchSourceId, payload.fetchTaskId, payload.sourceHandle);
      }
      await refreshSubscribedClientState({ notifyFeedPostsSynced: false });
    },
    [user, refreshSubscribedClientState, startSourceFetchPolling]
  );

  return {
    refreshSubscribedClientState,
    startSourceFetchPolling,
    handleSubscriptionSynced,
  };
}
