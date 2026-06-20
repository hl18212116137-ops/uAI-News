"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { AuthUser } from "@/lib/auth";
type User = AuthUser;
import type { NewsItem } from "@/lib/types";
import { RECOMMENDED_SIDEBAR_LIMIT } from "@/lib/feed-quality";
import { HOME_FEED_PAGE_SIZE, type FeedPage } from "@/lib/feed-pagination";
import type { SubscriptionMutateSuccessPayload } from "@/hooks/useSubscription";

/** 与 MainContent / SourcesList 侧栏行一致 */
export type SubscribedSourceRow = {
  id: string;
  handle: string;
  name: string;
  url?: string;
  avatar?: string;
  description?: string;
  enabled?: boolean;
  postCount: number;
  latestPostTime?: string;
  sourceType?: "blogger" | "media" | "academic";
};

type SetSources = Dispatch<SetStateAction<SubscribedSourceRow[]>>;
type SetRecommended = Dispatch<SetStateAction<SubscribedSourceRow[]>>;
type SetPosts = Dispatch<SetStateAction<NewsItem[]>>;
type SetFetchingIds = Dispatch<SetStateAction<Set<string>>>;

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
  onFeedPageSynced?: (page: Pick<FeedPage, "nextOffset" | "total" | "hasMore">) => void
) {
  const fetchPollsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const onSourceFetchEventRef = useRef(onSourceFetchEvent);
  const onFeedPageSyncedRef = useRef(onFeedPageSynced);

  useEffect(() => {
    onSourceFetchEventRef.current = onSourceFetchEvent;
  }, [onSourceFetchEvent]);

  useEffect(() => {
    onFeedPageSyncedRef.current = onFeedPageSynced;
  }, [onFeedPageSynced]);

  useEffect(
    () => () => {
      fetchPollsRef.current.forEach((id) => clearInterval(id));
      fetchPollsRef.current.clear();
    },
    []
  );

  const refreshSubscribedClientState = useCallback(async () => {
    if (!user) return;
    try {
      const [metaRes, recRes, feedRes] = await Promise.all([
        fetch("/api/me/subscribed-sources", { cache: "no-store", credentials: "same-origin" }),
        fetch(`/api/recommended-sources?limit=${RECOMMENDED_SIDEBAR_LIMIT}&random=1`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch(`/api/feed?offset=0&limit=${HOME_FEED_PAGE_SIZE}`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);
      const [meta, rec, feed] = await Promise.all([metaRes.json(), recRes.json(), feedRes.json()]);
      if (meta.success && Array.isArray(meta.sources)) setSourcesState(meta.sources);
      if (rec.success && Array.isArray(rec.sources)) setRecommendedState(rec.sources);
      if (feed.success && Array.isArray(feed.posts)) {
        setPosts(feed.posts);
        onFeedPageSyncedRef.current?.({
          nextOffset:
            typeof feed.nextOffset === "number" ? feed.nextOffset : feed.posts.length,
          total: typeof feed.total === "number" ? feed.total : feed.posts.length,
          hasMore: Boolean(feed.hasMore),
        });
      }
    } catch (e) {
      console.error("[useSubscribedFeedSync] refreshSubscribedClientState", e);
    }
  }, [user, setSourcesState, setRecommendedState, setPosts]);

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

      let pollInFlight = false;
      const pollTask = async () => {
        if (pollInFlight) return;
        pollInFlight = true;
        try {
          const r = await fetch(`/api/task-status?taskId=${encodeURIComponent(taskId)}`);
          const j = await r.json();
          const t = (j.task ?? j) as { status?: string };
          if (t?.status === "completed" || t?.status === "failed") {
            const activePoll = fetchPollsRef.current.get(taskId);
            if (activePoll) clearInterval(activePoll);
            fetchPollsRef.current.delete(taskId);
            setFetchingSourceIds((prev) => {
              const next = new Set(prev);
              next.delete(sourceId);
              return next;
            });
            onSourceFetchEventRef.current?.({
              sourceId,
              sourceHandle,
              taskId,
              status: t.status,
            });
            if (t.status === "completed") {
              void refreshSubscribedClientState();
            }
          }
        } catch {
          /* ignore transient poll errors */
        } finally {
          pollInFlight = false;
        }
      };

      const iv = setInterval(() => void pollTask(), 2000);
      fetchPollsRef.current.set(taskId, iv);
      void pollTask();
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
      await refreshSubscribedClientState();
    },
    [user, refreshSubscribedClientState, startSourceFetchPolling]
  );

  return {
    refreshSubscribedClientState,
    startSourceFetchPolling,
    handleSubscriptionSynced,
  };
}
