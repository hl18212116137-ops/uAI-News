import { NewsItem } from '../types';

/**
 * 候选池筛选模块
 * 在进行全量相似度比较前，先通过规则预过滤候选对
 * 减少不必要的 AI 调用，提升性能
 */

/**
 * 候选对类型
 */
export interface CandidatePair {
  item1: NewsItem;
  item2: NewsItem;
  reason: string; // 为什么这两个是候选对
}

/**
 * 筛选候选池
 * 使用时间窗口和快速规则预过滤
 *
 * @param items 新闻列表
 * @param timeWindowHours 时间窗口（小时）
 * @returns 候选对列表
 */
export function filterCandidates(
  items: NewsItem[],
  timeWindowHours: number = 72
): CandidatePair[] {
  if (items.length < 2) {
    return [];
  }

  const candidates: CandidatePair[] = [];
  const windowMs = timeWindowHours * 60 * 60 * 1000;

  // 找到最新推文时间
  const latestTime = Math.max(...items.map(item => new Date(item.publishedAt).getTime()));

  // 只考虑时间窗口内的推文
  const recentItems = items.filter(item => {
    const publishedTime = new Date(item.publishedAt).getTime();
    const age = latestTime - publishedTime;
    return age <= windowMs;
  });

  console.log(`[CandidateFilter] Filtered to ${recentItems.length} items within ${timeWindowHours}h window`);

  // 两两比较，使用快速规则判断是否为候选对
  for (let i = 0; i < recentItems.length; i++) {
    for (let j = i + 1; j < recentItems.length; j++) {
      const item1 = recentItems[i];
      const item2 = recentItems[j];

      const reason = shouldBeCandidate(item1, item2);
      if (reason) {
        candidates.push({ item1, item2, reason });
      }
    }
  }

  console.log(`[CandidateFilter] Found ${candidates.length} candidate pairs`);

  return candidates;
}

/**
 * 判断两个新闻是否应该成为候选对
 * 使用快速规则（不调用 AI）
 *
 * @returns 如果是候选对，返回原因；否则返回 null
 */
function shouldBeCandidate(item1: NewsItem, item2: NewsItem): string | null {
  // 规则 1：同一分类
  if (item1.category === item2.category && item1.category !== 'Other') {
    return `Same category: ${item1.category}`;
  }

  // 规则 2：标题或摘要中有共同的关键词（长度 > 3 的词）
  const keywords1 = extractKeywords(item1.title + ' ' + item1.summary);
  const keywords2 = extractKeywords(item2.title + ' ' + item2.summary);

  const commonKeywords = keywords1.filter(k => keywords2.includes(k));
  if (commonKeywords.length >= 2) {
    return `Common keywords: ${commonKeywords.slice(0, 3).join(', ')}`;
  }

  // 规则 3：同一作者
  if (item1.source.handle === item2.source.handle) {
    return `Same author: @${item1.source.handle}`;
  }

  // 规则 4：时间非常接近（1小时内）
  const time1 = new Date(item1.publishedAt).getTime();
  const time2 = new Date(item2.publishedAt).getTime();
  const timeDiff = Math.abs(time1 - time2);

  if (timeDiff < 60 * 60 * 1000) { // 1小时
    return `Published within 1 hour`;
  }

  return null;
}

/**
 * 提取关键词
 * 简单的关键词提取：长度 > 3 的词，转小写
 */
function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ') // 保留中英文和数字
    .split(/\s+/)
    .filter(w => w.length > 3);

  // 去重
  return Array.from(new Set(words));
}

/**
 * 按时间窗口分组
 * 将新闻按时间窗口分成多个组
 *
 * @param items 新闻列表
 * @param timeWindowHours 时间窗口（小时）
 * @returns 分组后的新闻列表
 */
export function groupByTimeWindow(
  items: NewsItem[],
  timeWindowHours: number
): NewsItem[][] {
  if (items.length === 0) return [];

  // 找到最新的帖子时间
  const latestTime = Math.max(...items.map(item => new Date(item.publishedAt).getTime()));
  const windowMs = timeWindowHours * 60 * 60 * 1000;

  // 筛选在时间窗口内的帖子（相对于最新帖子）
  const withinWindow = items.filter(item => {
    const publishedTime = new Date(item.publishedAt).getTime();
    const age = latestTime - publishedTime;
    return age <= windowMs;
  });

  // 返回单个分组
  return withinWindow.length > 0 ? [withinWindow] : [];
}
