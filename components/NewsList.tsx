"use client";

import {
  memo,
  useRef,
  useCallback,
  useLayoutEffect,
  useEffect,
} from "react";
import { NewsItem } from "@/lib/types";
import NewsCard from "./NewsCard";
import EmptyState from "./EmptyState";

type NewsListProps = {
  posts: NewsItem[];
  bookmarkedIds?: Set<string>;
  bookmarkPendingIds?: Set<string>;
  onBookmarkToggle?: (id: string, post: NewsItem) => void;
  passPendingIds?: Set<string>;
  onPassPost?: (post: NewsItem) => void;
  analysisActivePostId?: string | null;
  onAnalysisToggle?: (postId: string) => void;
  emptyFeedAwaitingFetch?: boolean;
};

export default memo(NewsList);

function NewsList({
  posts,
  bookmarkedIds,
  bookmarkPendingIds,
  onBookmarkToggle,
  passPendingIds,
  onPassPost,
  analysisActivePostId = null,
  onAnalysisToggle,
  emptyFeedAwaitingFetch = false,
}: NewsListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const rowNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const barRafRef = useRef<number | null>(null);
  const activePostIdRef = useRef(analysisActivePostId);

  useEffect(() => {
    activePostIdRef.current = analysisActivePostId;
  }, [analysisActivePostId]);

  const applyBarPosition = useCallback(() => {
    const listEl = listRef.current;
    const barEl = barRef.current;
    if (!listEl || !barEl) return;

    const id = activePostIdRef.current;
    if (!id) {
      barEl.style.opacity = "0";
      return;
    }

    const row = rowNodesRef.current.get(id);
    if (!row) {
      barEl.style.opacity = "0";
      return;
    }

    const lr = listEl.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    const top = rr.top - lr.top;
    const height = rr.height;

    barEl.style.transform = `translate3d(0, ${top}px, 0)`;
    barEl.style.height = `${height}px`;
    barEl.style.opacity = "1";
  }, []);

  const scheduleBarUpdate = useCallback(() => {
    if (barRafRef.current != null) return;
    barRafRef.current = requestAnimationFrame(() => {
      barRafRef.current = null;
      applyBarPosition();
    });
  }, [applyBarPosition]);

  const setRowRef = useCallback(
    (postId: string) => (el: HTMLDivElement | null) => {
      if (el) rowNodesRef.current.set(postId, el);
      else rowNodesRef.current.delete(postId);
      scheduleBarUpdate();
    },
    [scheduleBarUpdate],
  );

  useLayoutEffect(() => {
    scheduleBarUpdate();
  }, [scheduleBarUpdate, posts, analysisActivePostId]);

  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const scrollParent = listEl.closest(".main-content-scroll");
    const onScrollOrResize = () => scheduleBarUpdate();
    if (scrollParent) {
      scrollParent.addEventListener("scroll", onScrollOrResize, {
        passive: true,
      });
    }
    window.addEventListener("resize", onScrollOrResize, { passive: true });
    const ro = new ResizeObserver(onScrollOrResize);
    ro.observe(listEl);
    return () => {
      if (scrollParent) {
        scrollParent.removeEventListener("scroll", onScrollOrResize);
      }
      window.removeEventListener("resize", onScrollOrResize);
      ro.disconnect();
      if (barRafRef.current != null) {
        cancelAnimationFrame(barRafRef.current);
        barRafRef.current = null;
      }
    };
  }, [scheduleBarUpdate]);

  if (posts.length === 0) {
    return <EmptyState awaitingFetch={emptyFeedAwaitingFetch} />;
  }

  return (
    <div ref={listRef} className="relative flex w-full flex-col gap-0">
      <div
        ref={barRef}
        className="feed-analysis-rail pointer-events-none absolute right-0 top-0 z-[2] w-px bg-[#ffb224] will-change-transform"
        style={{ opacity: 0, height: 0 }}
        aria-hidden
        data-name="Analysis gold rail"
      />
      {posts.map((post) => (
        <div
          key={post.id}
          ref={setRowRef(post.id)}
          className="w-full shrink-0"
        >
          <NewsCard
            post={post}
            isBookmarked={bookmarkedIds?.has(post.id) ?? false}
            bookmarkPending={bookmarkPendingIds?.has(post.id) ?? false}
            onBookmarkToggle={onBookmarkToggle}
            passPending={passPendingIds?.has(post.id) ?? false}
            onPassPost={onPassPost}
            analysisActive={analysisActivePostId === post.id}
            onAnalysisToggle={onAnalysisToggle}
          />
        </div>
      ))}
    </div>
  );
}
