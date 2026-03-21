import type { NewsItem } from './types';
import type { Source } from './sources';

export interface Stats {
  bloggerCount: number;
  mediaCount: number;
  academicCount: number;
  totalPosts: number;
  todayPosts: number;
}

/**
 * 从已有数据计算统计信息（纯函数，不查 Supabase）
 */
export function getStatsFromData(posts: NewsItem[], sources: Source[]): Stats {
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
  const totalPosts = posts.length;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const todayPosts = posts.filter(p => new Date(p.createdAt) > oneDayAgo).length;
  return { bloggerCount, mediaCount, academicCount, totalPosts, todayPosts };
}
