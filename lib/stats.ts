import { getSources } from './sources';
import { getAllPosts } from './db';
import type { NewsItem } from './types';
import type { Source } from './sources';

export interface Stats {
  bloggerCount: number;
  mediaCount: number;
  academicCount: number;
  totalPosts: number;
  todayPosts: number;
}

export async function getStats(): Promise<Stats> {
  const sources = await getSources();
  const posts = await getAllPosts();

  // 统计博主、媒体和学术网站数量
  const bloggerCount = sources.filter(s => s.sourceType === 'blogger' && s.enabled !== false).length;
  const mediaCount = sources.filter(s => s.sourceType === 'media' && s.enabled !== false).length;
  const academicCount = sources.filter(s => s.sourceType === 'academic' && s.enabled !== false).length;

  // 统计推文数量
  const totalPosts = posts.length;

  // 统计今日新增推文（最近24小时）
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const todayPosts = posts.filter(p => new Date(p.createdAt) > oneDayAgo).length;

  return {
    bloggerCount,
    mediaCount,
    academicCount,
    totalPosts,
    todayPosts,
  };
}

/**
 * 从已有数据计算统计信息（纯函数，不查 Supabase）
 */
export function getStatsFromData(posts: NewsItem[], sources: Source[]): Stats {
  const enabled = sources.filter(s => s.enabled !== false);
  const bloggerCount  = enabled.filter(s => s.sourceType === 'blogger').length;
  const mediaCount    = enabled.filter(s => s.sourceType === 'media').length;
  const academicCount = enabled.filter(s => s.sourceType === 'academic').length;
  const totalPosts = posts.length;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const todayPosts = posts.filter(p => new Date(p.createdAt) > oneDayAgo).length;
  return { bloggerCount, mediaCount, academicCount, totalPosts, todayPosts };
}
