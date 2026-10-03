"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { InsightAnalysisPayload, NewsItem } from "@/lib/types";
import { hasRawInsightPayload } from "@/lib/insight-echo-guard";

const CLOSE_MS = 220; // app/globals.css --layout-duration
const PREFETCH_LIMIT = 12;

/** Owns one insight session, its request lifecycle, and the sidebar transition. */
export function useInsightPanel(posts: NewsItem[], onRead: (postId: string) => void) {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisPostId, setAnalysisPostId] = useState<string | null>(null);
  const [analysisCache, setAnalysisCache] = useState<Record<string, InsightAnalysisPayload>>({});
  const [analysisLoadingPostId, setAnalysisLoadingPostId] = useState<string | null>(null);
  const [analysisErrorByPost, setAnalysisErrorByPost] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const cacheRef = useRef(analysisCache);
  cacheRef.current = analysisCache;
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showAnalysisPanel = analysisOpen && analysisPostId != null;
  const analysisSlidesOpen = showAnalysisPanel && revealed;

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  useLayoutEffect(() => {
    if (!showAnalysisPanel) {
      setRevealed(false);
      return;
    }
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setRevealed(true));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [showAnalysisPanel]);

  const closeAnalysisSession = useCallback(() => {
    clearCloseTimer();
    setAnalysisOpen(false);
    if (!analysisSlidesOpen) {
      setAnalysisPostId(null);
      return;
    }
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setAnalysisPostId(null);
    }, CLOSE_MS);
  }, [analysisSlidesOpen, clearCloseTimer]);

  const handleAnalysisToggle = useCallback((postId: string) => {
    clearCloseTimer();
    onRead(postId);
    if (analysisPostId === postId && analysisOpen) {
      closeAnalysisSession();
      return;
    }
    setAnalysisPostId(postId);
    setAnalysisOpen(true);
  }, [analysisOpen, analysisPostId, clearCloseTimer, closeAnalysisSession, onRead]);

  useEffect(() => {
    if (!analysisOpen || !analysisPostId) return;
    if (hasRawInsightPayload(cacheRef.current[analysisPostId])) {
      setAnalysisLoadingPostId(null);
      return;
    }
    const controller = new AbortController();
    setAnalysisLoadingPostId(analysisPostId);
    setAnalysisErrorByPost((current) => ({ ...current, [analysisPostId]: "" }));
    void (async () => {
      try {
        const response = await fetch("/api/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId: analysisPostId }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || !data.success || !data.analysis) {
          const extra = data.retryAfterSec > 0 ? `（约 ${data.retryAfterSec} 秒后可重试）` : "";
          throw new Error((data.error || "分析生成失败") + extra);
        }
        if (!controller.signal.aborted) {
          setAnalysisCache((current) => ({ ...current, [analysisPostId]: data.analysis }));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setAnalysisErrorByPost((current) => ({
            ...current,
            [analysisPostId]: error instanceof Error ? error.message : "分析暂时不可用，请稍后重试",
          }));
        }
      } finally {
        if (!controller.signal.aborted) setAnalysisLoadingPostId(null);
      }
    })();
    return () => controller.abort();
  }, [analysisOpen, analysisPostId, retryVersion]);

  const prefetchKey = useMemo(() => posts.filter((post) => !post.longform?.translatedContent)
    .slice(0, PREFETCH_LIMIT).map((post) => post.id).join("\0"), [posts]);
  useEffect(() => {
    if (!prefetchKey) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      const postIds = prefetchKey.split("\0").filter((id) => !cacheRef.current[id]);
      if (!postIds.length) return;
      void fetch("/api/analysis/prefetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({ postIds }),
      }).then(async (response) => {
        const data = await response.json();
        if (controller.signal.aborted || !response.ok || !data.success || !data.analyses) return;
        setAnalysisCache((current) => ({ ...data.analyses, ...current }));
      }).catch(() => { /* Opening the panel still loads the analysis on demand. */ });
    }, 3200);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [prefetchKey]);

  const retryInsightAnalysis = useCallback(() => {
    if (!analysisPostId) return;
    setAnalysisCache((current) => {
      const next = { ...current };
      delete next[analysisPostId];
      return next;
    });
    setRetryVersion((version) => version + 1);
  }, [analysisPostId]);

  return {
    analysisOpen, analysisPostId, analysisCache, analysisLoadingPostId,
    analysisErrorByPost, showAnalysisPanel, analysisSlidesOpen,
    closeAnalysisSession, handleAnalysisToggle, retryInsightAnalysis,
  };
}
