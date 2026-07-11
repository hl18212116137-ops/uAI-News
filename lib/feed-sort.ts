import type { NewsItem } from "@/lib/types";

function timeMs(value: unknown): number {
  const ms = new Date(String(value ?? "")).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function recentlyFetchedRank(item: NewsItem, recentlyFetchedSinceMs?: number): number {
  if (recentlyFetchedSinceMs == null) return 0;
  const createdAt = timeMs(item.createdAt);
  return createdAt >= recentlyFetchedSinceMs ? 1 : 0;
}

export type FeedDisplaySortOptions = {
  recentlyFetchedSinceMs?: number;
  prioritizeRecentlyFetched?: boolean;
};

function displayRank(item: NewsItem, options?: FeedDisplaySortOptions): number {
  if (options?.prioritizeRecentlyFetched) {
    return recentlyFetchedRank(item, options.recentlyFetchedSinceMs);
  }
  return 0;
}

export function compareNewsItemsForFeedDisplay(
  a: NewsItem,
  b: NewsItem,
  options?: FeedDisplaySortOptions
): number {
  const rankDiff = displayRank(b, options) - displayRank(a, options);
  if (rankDiff !== 0) return rankDiff;

  const publishedDiff = timeMs(b.publishedAt) - timeMs(a.publishedAt);
  if (publishedDiff !== 0) return publishedDiff;

  return timeMs(b.createdAt) - timeMs(a.createdAt);
}
