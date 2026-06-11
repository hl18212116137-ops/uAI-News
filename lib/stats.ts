import type { NewsItem } from './types';
import type { Source } from './sources';

export interface Stats {
  bloggerCount: number;
  mediaCount: number;
  academicCount: number;
  totalPosts: number;
  todayPosts: number;
}

/** 当前订阅列表条目的最小信息（用于与 Feed 对齐的统计，避免与全库数据脱节） */
export type SourceMetaForStats = {
  sourceType?: 'blogger' | 'media' | 'academic';
};

/**
 * 按「当前订阅源 + 当前 Feed 帖子」计算统计（个性化 / 访客默认订阅路径）
 */
export function getStatsFromSubscribedFeed(
  feedPosts: NewsItem[],
  subscribedSources: SourceMetaForStats[]
): Stats {
  const { bloggerCount, mediaCount, academicCount } = subscribedSources.reduce(
    (acc, s) => {
      const t = s.sourceType ?? 'blogger';
      if (t === 'blogger') acc.bloggerCount++;
      else if (t === 'media') acc.mediaCount++;
      else if (t === 'academic') acc.academicCount++;
      return acc;
    },
    { bloggerCount: 0, mediaCount: 0, academicCount: 0 }
  );
  const totalPosts = feedPosts.length;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const todayPosts = feedPosts.filter((p) => new Date(p.createdAt) > oneDayAgo).length;
  return { bloggerCount, mediaCount, academicCount, totalPosts, todayPosts };
}

/**
 * 按全库 sources + 已算好的帖子数量统计（避免为 total/today 拉全表 news_items）
 */
export function getStatsFromSourceListAndPostCounts(
  sources: Pick<Source, 'sourceType' | 'enabled'>[],
  totalPosts: number,
  todayPosts: number
): Stats {
  const { bloggerCount, mediaCount, academicCount } = sources.reduce(
    (acc, s) => {
      if (s.enabled === false) return acc;
      if (s.sourceType === 'blogger') acc.bloggerCount++;
      else if (s.sourceType === 'media') acc.mediaCount++;
      else if (s.sourceType === 'academic') acc.academicCount++;
      return acc;
    },
    { bloggerCount: 0, mediaCount: 0, academicCount: 0 }
  );
  return { bloggerCount, mediaCount, academicCount, totalPosts, todayPosts };
}

/**
 * 从已有数据计算统计信息（纯函数，不查 Supabase）
 */
export function getStatsFromData(posts: NewsItem[], sources: Source[]): Stats {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const todayPosts = posts.filter((p) => new Date(p.createdAt) > oneDayAgo).length;
  return getStatsFromSourceListAndPostCounts(sources, posts.length, todayPosts);
}
