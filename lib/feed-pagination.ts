import type { NewsItem } from "@/lib/types";

export const HOME_FEED_PAGE_SIZE = 12;
export const HOME_RECOMMENDED_PREFETCH_LIMIT = 48;

export type FeedPage = {
  posts: NewsItem[];
  total: number;
  nextOffset: number;
  hasMore: boolean;
};

export function stripLongformPosts(posts: NewsItem[]) {
  return posts.filter((post) => !post.longform?.translatedContent);
}

export function clampFeedPageLimit(value: unknown, fallback = HOME_FEED_PAGE_SIZE) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), 40);
}

export function clampFeedPageOffset(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.trunc(parsed), 0);
}

export function makeFeedPage(posts: NewsItem[], offset: number, limit: number): FeedPage {
  const start = clampFeedPageOffset(offset);
  const pageSize = clampFeedPageLimit(limit);
  const pagePosts = posts.slice(start, start + pageSize);
  const nextOffset = start + pagePosts.length;

  return {
    posts: pagePosts,
    total: posts.length,
    nextOffset,
    hasMore: nextOffset < posts.length,
  };
}
