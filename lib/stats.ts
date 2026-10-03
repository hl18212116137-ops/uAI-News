import type { NewsItem } from './types';
import type { Source } from './sources';

export interface Stats {
  sourceCount: number;
  recentPosts: number;
}

/** Stats use the same source/feed scope as the visible home page. */
export function getStatsFromSubscribedFeed(feedPosts: NewsItem[], subscribedSources: unknown[]): Stats {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return {
    sourceCount: subscribedSources.length,
    recentPosts: feedPosts.filter((post) => new Date(post.createdAt).getTime() > since).length,
  };
}

export function getStatsFromSourceListAndPostCounts(sources: Pick<Source, 'enabled'>[], recentPosts: number): Stats {
  return { sourceCount: sources.filter((source) => source.enabled !== false).length, recentPosts };
}
