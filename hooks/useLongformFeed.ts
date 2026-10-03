"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { LONGFORM_FEED_PAGE_SIZE, type FeedPage } from "@/lib/feed-pagination";
import type { NewsItem } from "@/lib/types";
import type { SourceActivityTone } from "@/components/SourceActivityNotice";

export const LONGFORM_CATEGORY = "优质长文";
type Notice = { title: string; detail: string; tone: SourceActivityTone };
type Options = {
  setPosts: Dispatch<SetStateAction<NewsItem[]>>;
  activeCategory: string;
  revealLongform: () => void;
  notify: (notice: Notice, duration?: number) => void;
};

export function useLongformFeed({ setPosts, activeCategory, revealLongform, notify }: Options) {
  const [loaded, setLoaded] = useState(false);
  const [longformLoading, setLongformLoading] = useState(false);
  const [longformError, setLongformError] = useState("");
  const [longformLoadingMore, setLoadingMore] = useState(false);
  const [longformLoadMoreError, setLoadMoreError] = useState("");
  const [longformHasMore, setHasMore] = useState(false);
  const [longformTotal, setTotal] = useState(0);
  const offset = useRef(0);
  const [longformPreviewIds, setPreviewIds] = useState<Set<string>>(() => new Set());
  const [longformFullLoadingIds, setFullLoadingIds] = useState<Set<string>>(() => new Set());
  const [longformFullErrorById, setFullErrors] = useState<Record<string, string>>({});
  const [longformActionPendingIds, setActionPendingIds] = useState<Set<string>>(() => new Set());
  const requests = useRef(new Map<string, AbortController>());
  useEffect(() => () => {
    requests.current.forEach((controller) => controller.abort());
    requests.current.clear();
  }, []);
  const loadPage = useCallback(async (append: boolean) => {
    if (requests.current.has("list")) return;
    const controller = new AbortController();
    requests.current.set("list", controller);
    if (append) setLoadingMore(true);
    else setLongformLoading(true);
    setLongformError("");
    setLoadMoreError("");
    const start = append ? offset.current : 0;
    try {
      const params = new URLSearchParams({ offset: String(start), limit: String(LONGFORM_FEED_PAGE_SIZE) });
      const response = await fetch(`/api/longform/posts?${params}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json() as Partial<FeedPage> & { success?: boolean; error?: string };
      if (!response.ok || !data.success || !Array.isArray(data.posts)) throw new Error(data.error || "长文加载失败");
      if (controller.signal.aborted) return;
      const incoming = data.posts;
      setPosts((current) => {
        const byId = new Map(incoming.map((post) => [post.id, post]));
        for (const post of current) {
          const isFull = post.longform?.translatedContent && !post.longform.isPreview;
          if (isFull || (!byId.has(post.id) && (append || !post.longform))) byId.set(post.id, post);
        }
        return [...byId.values()];
      });
      setPreviewIds((current) => new Set([
        ...(append ? current : []), ...incoming.filter((post) => post.longform?.isPreview).map((post) => post.id),
      ]));
      offset.current = data.nextOffset ?? start + incoming.length;
      setTotal(data.total ?? incoming.length);
      setHasMore(Boolean(data.hasMore));
      setLoaded(true);
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : "长文加载失败";
        if (append) setLoadMoreError(message);
        else setLongformError(message);
      }
    } finally {
      if (requests.current.get("list") === controller) requests.current.delete("list");
      if (!controller.signal.aborted) {
        setLongformLoading(false);
        setLoadingMore(false);
      }
    }
  }, [setPosts]);
  const loadLongformPosts = useCallback(() => loadPage(false), [loadPage]);
  const loadMoreLongformPosts = useCallback(() => {
    if (longformHasMore) void loadPage(true);
  }, [longformHasMore, loadPage]);

  useEffect(() => {
    // An error stays visible until an explicit retry; avoid an endless request loop.
    if (activeCategory === LONGFORM_CATEGORY && !loaded && !longformLoading && !longformError) void loadLongformPosts();
  }, [activeCategory, loaded, longformLoading, longformError, loadLongformPosts]);

  const loadFullLongformPost = useCallback(async (postId: string) => {
    const key = `full:${postId}`;
    if (!longformPreviewIds.has(postId) || requests.current.has(key)) return;
    const controller = new AbortController();
    requests.current.set(key, controller);
    setFullLoadingIds((current) => new Set(current).add(postId));
    setFullErrors((current) => ({ ...current, [postId]: "" }));
    try {
      const response = await fetch(`/api/longform/posts/${encodeURIComponent(postId)}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data.success || !data.post?.longform?.translatedContent) throw new Error(data.error || "长文正文加载失败");
      if (controller.signal.aborted) return;
      setPosts((current) => current.map((post) => post.id === postId ? data.post : post));
      setPreviewIds((current) => { const next = new Set(current); next.delete(postId); return next; });
    } catch (error) {
      if (!controller.signal.aborted) setFullErrors((current) => ({ ...current, [postId]: error instanceof Error ? error.message : "长文正文加载失败" }));
    } finally {
      if (requests.current.get(key) === controller) requests.current.delete(key);
      if (!controller.signal.aborted) setFullLoadingIds((current) => { const next = new Set(current); next.delete(postId); return next; });
    }
  }, [longformPreviewIds, setPosts]);

  const handleLongformImported = useCallback((post: NewsItem) => {
    setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)]);
    setPreviewIds((current) => { const next = new Set(current); next.delete(post.id); return next; });
    setLoaded(false);
    setLongformError("");
    revealLongform();
  }, [revealLongform, setPosts]);

  const handleLongformExtractFromPost = useCallback(async (post: NewsItem) => {
    const key = `extract:${post.id}`;
    if (requests.current.has(key)) return;
    const controller = new AbortController();
    requests.current.set(key, controller);
    setActionPendingIds((current) => new Set(current).add(post.id));
    try {
      const response = await fetch("/api/longform/from-post", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id }), signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || !data.success || !data.post?.longform?.translatedContent) {
        const missing = data.code === "NO_LONGFORM" || response.status === 404;
        notify({ title: missing ? "没有长文存在" : "长文抓取失败", detail: data.error || "请稍后重试。", tone: "error" }, 5600);
        return;
      }
      handleLongformImported(data.post);
      notify({ title: data.alreadyExists ? "这条推文已有长文" : "长文已添加", detail: "已放入「优质长文」，可以继续阅读或展开原文。", tone: "success" }, 3600);
    } catch (error) {
      if (!controller.signal.aborted) notify({ title: "长文抓取失败", detail: error instanceof Error ? error.message : "请稍后重试。", tone: "error" }, 5600);
    } finally {
      if (requests.current.get(key) === controller) requests.current.delete(key);
      if (!controller.signal.aborted) setActionPendingIds((current) => { const next = new Set(current); next.delete(post.id); return next; });
    }
  }, [handleLongformImported, notify]);

  return { longformLoading, longformError, longformLoadingMore, longformLoadMoreError,
    longformHasMore, longformTotal, loadMoreLongformPosts, longformPreviewIds, longformFullLoadingIds,
    longformFullErrorById, longformActionPendingIds, loadLongformPosts,
    loadFullLongformPost, handleLongformExtractFromPost };
}
