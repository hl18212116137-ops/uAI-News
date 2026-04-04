"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { User } from "@supabase/supabase-js";
import type { NewsItem } from "@/lib/types";
import type { SubscriptionMutateSuccessPayload } from "@/hooks/useSubscription";

/** 与 MainContent / SourcesList 侧栏行一致 */
export type SubscribedSourceRow = {
  id: string;
  handle: string;
  name: string;
  avatar?: string;
  description?: string;
  postCount: number;
  latestPostTime?: string;
  sourceType?: "blogger" | "media" | "academic";
};

type SetSources = Dispatch<SetStateAction<SubscribedSourceRow[]>>;
type SetRecommended = Dispatch<SetStateAction<SubscribedSourceRow[]>>;
type SetPosts = Dispatch<SetStateAction<NewsItem[]>>;
type SetFetchingIds = Dispatch<SetStateAction<Set<string>>>;

/**
 * 订阅/抓取后的增量同步：me/subscribed-sources、recommended、feed + task-status 轮询
 */
export function useSubscribedFeedSync(
  user: User | null,
  setSourcesState: SetSources,
  setRecommendedState: SetRecommended,
  setPosts: SetPosts,
  setFetchingSourceIds: SetFetchingIds
) {
  const fetchPollsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

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
        fetch("/api/me/subscribed-sources"),
        fetch("/api/recommended-sources?limit=2&random=1"),
        fetch("/api/me/subscribed-feed"),
      ]);
      const [meta, rec, feed] = await Promise.all([metaRes.json(), recRes.json(), feedRes.json()]);
      if (meta.success && Array.isArray(meta.sources)) setSourcesState(meta.sources);
      if (rec.success && Array.isArray(rec.sources)) setRecommendedState(rec.sources);
      if (feed.success && Array.isArray(feed.posts)) setPosts(feed.posts);
    } catch (e) {
      console.error("[useSubscribedFeedSync] refreshSubscribedClientState", e);
    }
  }, [user, setSourcesState, setRecommendedState, setPosts]);

  const startSourceFetchPolling = useCallback(
    (sourceId: string, taskId: string) => {
      if (fetchPollsRef.current.has(taskId)) return;
      setFetchingSourceIds((prev) => new Set(prev).add(sourceId));
      const iv = setInterval(async () => {
        try {
          const r = await fetch(`/api/task-status?taskId=${encodeURIComponent(taskId)}`);
          const j = await r.json();
          const t = (j.task ?? j) as { status?: string };
          if (t?.status === "completed" || t?.status === "failed") {
            clearInterval(iv);
            fetchPollsRef.current.delete(taskId);
            setFetchingSourceIds((prev) => {
              const next = new Set(prev);
              next.delete(sourceId);
              return next;
            });
            if (t.status === "completed") void refreshSubscribedClientState();
          }
        } catch {
          /* ignore transient poll errors */
        }
      }, 2500);
      fetchPollsRef.current.set(taskId, iv);
    },
    [refreshSubscribedClientState, setFetchingSourceIds]
  );

  const handleSubscriptionSynced = useCallback(
    async (payload: SubscriptionMutateSuccessPayload) => {
      if (!user) return;
      await refreshSubscribedClientState();
      if (payload.action === "subscribe") {
        try {
          const res = await fetch("/api/sources/fetch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceId: payload.sourceId }),
          });
          const data = await res.json();
          if (res.ok && data.success && data.taskId) {
            startSourceFetchPolling(payload.sourceId, data.taskId);
          }
        } catch {
          /* list already refreshed */
        }
      }
    },
    [user, refreshSubscribedClientState, startSourceFetchPolling]
  );

  return {
    refreshSubscribedClientState,
    startSourceFetchPolling,
    handleSubscriptionSynced,
  };
}
