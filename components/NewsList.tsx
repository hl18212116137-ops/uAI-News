"use client";

import {
  memo,
  useRef,
  useCallback,
  useLayoutEffect,
  useState,
  useEffect,
} from "react";
import { NewsItem } from "@/lib/types";
import NewsCard from "./NewsCard";
import EmptyState from "./EmptyState";

type NewsListProps = {
  posts: NewsItem[];
  bookmarkedIds?: Set<string>;
  onBookmarkToggle?: (id: string) => void;
  analysisActivePostId?: string | null;
  onAnalysisToggle?: (postId: string) => void;
  emptyFeedDemoSourcesHint?: boolean;
};

type BarState = { visible: boolean; top: number; height: number };

export default memo(NewsList);

function NewsList({
  posts,
  bookmarkedIds,
  onBookmarkToggle,
  analysisActivePostId = null,
  onAnalysisToggle,
  emptyFeedDemoSourcesHint = false,
}: NewsListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const rowNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const [bar, setBar] = useState<BarState>({
    visible: false,
    top: 0,
    height: 0,
  });

  const updateBarPosition = useCallback(() => {
    const listEl = listRef.current;
    const id = analysisActivePostId;
    if (!listEl || !id) {
      setBar((prev) =>
        prev.visible ? { visible: false, top: 0, height: 0 } : prev
      );
      return;
    }
    const row = rowNodesRef.current.get(id);
    if (!row) {
      setBar((prev) =>
        prev.visible ? { visible: false, top: 0, height: 0 } : prev
      );
      return;
    }
    const lr = listEl.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    setBar({
      visible: true,
      top: rr.top - lr.top,
      height: rr.height,
    });
  }, [analysisActivePostId]);

  const setRowRef = useCallback(
    (postId: string) => (el: HTMLDivElement | null) => {
      if (el) rowNodesRef.current.set(postId, el);
      else rowNodesRef.current.delete(postId);
      requestAnimationFrame(() => updateBarPosition());
    },
    [updateBarPosition]
  );

  useLayoutEffect(() => {
    updateBarPosition();
    const id = requestAnimationFrame(() => updateBarPosition());
    return () => cancelAnimationFrame(id);
  }, [updateBarPosition, posts]);

  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const scrollParent = listEl.closest(".overflow-y-auto");
    const onScrollOrResize = () => updateBarPosition();
    if (scrollParent) {
      scrollParent.addEventListener("scroll", onScrollOrResize, {
        passive: true,
      });
    }
    window.addEventListener("resize", onScrollOrResize);
    const ro = new ResizeObserver(onScrollOrResize);
    ro.observe(listEl);
    return () => {
      if (scrollParent) {
        scrollParent.removeEventListener("scroll", onScrollOrResize);
      }
      window.removeEventListener("resize", onScrollOrResize);
      ro.disconnect();
    };
  }, [updateBarPosition]);

  if (posts.length === 0) {
    return <EmptyState demoSourcesHint={emptyFeedDemoSourcesHint} />;
  }

  return (
    <div ref={listRef} className="relative flex w-full flex-col gap-0">
      <div
        className="motion-layout-metrics pointer-events-none absolute right-0 z-[2] w-[2px] bg-[#ffb224]"
        style={{
          top: bar.top,
          height: bar.height,
          opacity: bar.visible ? 1 : 0,
        }}
        aria-hidden
        data-name="Analysis gold rail"
      />
      {posts.map((post, index) => (
        <div
          key={post.id}
          ref={setRowRef(post.id)}
          className="w-full shrink-0"
        >
          <NewsCard
            post={post}
            isBookmarked={bookmarkedIds?.has(post.id) ?? false}
            onBookmarkToggle={onBookmarkToggle}
            analysisActive={analysisActivePostId === post.id}
            onAnalysisToggle={onAnalysisToggle}
            avatarPriority={index < 8}
          />
        </div>
      ))}
    </div>
  );
}
