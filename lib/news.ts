import { NewsItem, NewsCategory } from "./types";
import { getAllPosts } from "./db";

/**
 * 获取排序后的新闻列表
 * 统一入口：读取数据 + 筛选 + 排序
 * @param category 可选的分类筛选参数，如果为空则返回所有新闻
 * @param query 可选的搜索关键词，用于搜索标题、摘要和内容
 * @param sourceHandle 可选的博主 handle，用于筛选特定博主的推文
 * @returns Promise<NewsItem[]> 排序后的新闻数组
 */
export async function getSortedPosts(category?: string, query?: string, sourceHandle?: string): Promise<NewsItem[]> {
  let posts = await getAllPosts();

  // 如果指定了博主，进行筛选
  if (sourceHandle && sourceHandle.trim() !== "") {
    posts = filterBySource(posts, sourceHandle);
  }

  // 如果指定了分类，进行筛选
  if (category && category !== "all") {
    posts = filterByCategory(posts, category);
  }

  // 如果指定了搜索关键词，进行搜索
  if (query && query.trim() !== "") {
    posts = searchNews(posts, query);
  }

  return sortByPublishedDate(posts);
}

/**
 * 按关键词搜索新闻
 * 在标题、摘要和内容中搜索关键词（不区分大小写）
 * @param posts 新闻数组
 * @param query 搜索关键词
 * @returns 搜索结果数组
 */
export function searchNews(posts: NewsItem[], query: string): NewsItem[] {
  const lowerQuery = query.toLowerCase().trim();

  return posts.filter((post) => {
    // 类型安全检查：确保必要字段存在且为字符串类型
    if (!post.title || typeof post.title !== 'string') return false;
    if (!post.summary || typeof post.summary !== 'string') return false;
    if (!post.content || typeof post.content !== 'string') return false;

    const titleMatch = post.title.toLowerCase().includes(lowerQuery);
    const summaryMatch = post.summary.toLowerCase().includes(lowerQuery);
    const contentMatch = post.content.toLowerCase().includes(lowerQuery);

    return titleMatch || summaryMatch || contentMatch;
  });
}

/**
 * 按博主筛选新闻
 * @param posts 新闻数组
 * @param handle 博主的 handle（用户名）
 * @returns 筛选后的新闻数组
 */
export function filterBySource(posts: NewsItem[], handle: string): NewsItem[] {
  const lowerHandle = handle.toLowerCase().trim();

  return posts.filter((post) => {
    // source 字段是对象，比较 handle 字段
    if (post.source && typeof post.source === "object") {
      const sourceHandle = post.source.handle;
      return sourceHandle && sourceHandle.toLowerCase() === lowerHandle;
    }

    return false;
  });
}

/**
 * 统计每个博主的推文数量
 * @param posts 新闻数组
 * @returns 博主 handle 到推文数量的映射
 */
export function getPostCountBySource(posts: NewsItem[]): Record<string, number> {
  const counts: Record<string, number> = {};

  posts.forEach((post) => {
    let handle: string | undefined;

    // 处理 source 字段：可能是字符串或对象
    if (typeof post.source === "string") {
      handle = post.source;
    } else if (post.source && typeof post.source === "object") {
      handle = (post.source as any).handle;
    }

    if (handle) {
      const lowerHandle = handle.toLowerCase();
      counts[lowerHandle] = (counts[lowerHandle] || 0) + 1;
    }
  });

  return counts;
}

/**
 * 获取每个博主的最新推文时间
 * @param posts 新闻数组
 * @returns 博主 handle 到最新推文时间的映射
 */
export function getLatestPostTimeBySource(posts: NewsItem[]): Record<string, string> {
  const latestTimes: Record<string, string> = {};

  posts.forEach((post) => {
    let handle: string | undefined;

    // 处理 source 字段：可能是字符串或对象
    if (typeof post.source === "string") {
      handle = post.source;
    } else if (post.source && typeof post.source === "object") {
      handle = (post.source as any).handle;
    }

    if (handle && post.publishedAt) {
      const lowerHandle = handle.toLowerCase();
      const currentTime = latestTimes[lowerHandle];

      // 如果没有记录或当前推文更新，则更新时间
      if (!currentTime || new Date(post.publishedAt).getTime() > new Date(currentTime).getTime()) {
        latestTimes[lowerHandle] = post.publishedAt;
      }
    }
  });

  return latestTimes;
}

/**
 * 按分类筛选新闻
 * @param posts 新闻数组
 * @param category 分类名称
 * @returns 筛选后的新闻数组
 */
export function filterByCategory(posts: NewsItem[], category: string): NewsItem[] {
  return posts.filter((post) => post.category === category);
}

/**
 * 按发布时间排序新闻（最新的在前）
 * @param posts 新闻数组
 * @returns 排序后的新闻数组
 */
export function sortByPublishedDate(posts: NewsItem[]): NewsItem[] {
  return [...posts].sort((a, b) => {
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

/**
 * 获取最近N天最值得关注的新闻
 * @param days 天数，默认3天
 * @param limit 返回数量，默认10条
 * @returns Promise<NewsItem[]> 按重要性评分排序的新闻数组
 */
export async function getTopImportantNews(days: number = 3, limit: number = 10): Promise<NewsItem[]> {
  const allPosts = await getAllPosts();

  // 计算截止时间
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

  // 筛选最近N天的新闻
  const recentPosts = allPosts.filter((post) => {
    const publishedTime = new Date(post.publishedAt).getTime();
    return publishedTime >= cutoffTime;
  });

  // 按重要性评分排序（降序）
  const sortedByScore = [...recentPosts].sort((a, b) => {
    const scoreA = a.importanceScore ?? 0;
    const scoreB = b.importanceScore ?? 0;
    return scoreB - scoreA;
  });

  // 返回前N条
  return sortedByScore.slice(0, limit);
}
