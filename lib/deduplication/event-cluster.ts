import { NewsItem, EventCluster } from '../types';
import { AIService } from '../ai/ai-service';
import { UnionFind } from './union-find';
import { SimilarityResult } from './types';
import { selectBestFromCluster } from './representative-selector';

/**
 * 事件聚合模块
 * 将描述同一事件的多条推文聚合为事件簇
 *
 * 注意：此模块为 Phase 2 新架构，默认关闭
 * 通过环境变量 EVENT_CLUSTER_ENABLED=true 启用
 */

/**
 * 多维度相似度评分
 */
interface DimensionScore {
  entityOverlap: number;      // 实体重叠
  categoryMatch: number;      // 分类匹配
  summarySimilarity: number;  // 摘要相似度
  timeProximity: number;      // 时间接近度
}

/**
 * 计算实体重叠度
 * 基于标题和摘要中的关键词
 */
function calculateEntityOverlap(item1: NewsItem, item2: NewsItem): number {
  const text1 = (item1.title + ' ' + item1.summary).toLowerCase();
  const text2 = (item2.title + ' ' + item2.summary).toLowerCase();

  const words1 = new Set(
    text1.replace(/[^\w\s\u4e00-\u9fa5]/g, ' ').split(/\s+/).filter(w => w.length > 3)
  );
  const words2 = new Set(
    text2.replace(/[^\w\s\u4e00-\u9fa5]/g, ' ').split(/\s+/).filter(w => w.length > 3)
  );

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return (intersection.size / union.size) * 100;
}

/**
 * 计算时间接近度（0-100）
 * 时间越近，分数越高
 */
function calculateTimeProximity(item1: NewsItem, item2: NewsItem, maxHours: number = 72): number {
  const time1 = new Date(item1.publishedAt).getTime();
  const time2 = new Date(item2.publishedAt).getTime();
  const diffHours = Math.abs(time1 - time2) / (1000 * 60 * 60);

  if (diffHours >= maxHours) return 0;
  return (1 - diffHours / maxHours) * 100;
}

/**
 * 计算多维度相似度
 */
function calculateMultiDimensionScore(item1: NewsItem, item2: NewsItem): number {
  const entityOverlap = calculateEntityOverlap(item1, item2);
  const categoryMatch = item1.category === item2.category ? 100 : 0;
  const timeProximity = calculateTimeProximity(item1, item2);

  // 加权综合评分
  return (
    entityOverlap * 0.45 +
    categoryMatch * 0.30 +
    timeProximity * 0.25
  );
}

/**
 * 事件聚合主函数
 * 将相似的推文聚合为事件簇
 *
 * @param items 新闻列表
 * @param aiService AI 服务（可选，用于 AI 二次判断）
 * @returns 事件簇列表
 */
export async function clusterEvents(
  items: NewsItem[],
  aiService?: AIService
): Promise<EventCluster[]> {
  if (items.length < 2) {
    return items.map(item => ({
      id: `cluster_${item.id}`,
      canonicalSummary: item.summary,
      entities: [],
      eventType: 'other',
      representativePostId: item.id,
      relatedPostIds: [],
      createdAt: new Date().toISOString()
    }));
  }

  const threshold = parseFloat(process.env.EVENT_DUPLICATE_THRESHOLD || '0.75') * 100;

  console.log(`[EventCluster] Clustering ${items.length} items with threshold ${threshold}`);

  // 使用 Union-Find 进行聚类
  const uf = new UnionFind();
  for (const item of items) {
    uf.add(item.id);
  }

  // 计算所有对的相似度
  let mergeCount = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const score = calculateMultiDimensionScore(items[i], items[j]);

      if (score >= threshold) {
        uf.union(items[i].id, items[j].id);
        mergeCount++;
      }
    }
  }

  console.log(`[EventCluster] Merged ${mergeCount} pairs`);

  // 获取聚类结果
  const clusterMap = uf.getClusters();
  const clusters: EventCluster[] = [];

  for (const ids of clusterMap.values()) {
    const clusterItems = ids
      .map(id => items.find(item => item.id === id))
      .filter((item): item is NewsItem => item !== undefined);

    if (clusterItems.length === 0) continue;

    // 选择代表推文
    const representative = selectBestFromCluster(clusterItems);
    const relatedIds = clusterItems
      .filter(item => item.id !== representative.id)
      .map(item => item.id);

    clusters.push({
      id: `cluster_${representative.id}`,
      canonicalSummary: representative.summary,
      entities: [],
      eventType: representative.category,
      representativePostId: representative.id,
      relatedPostIds: relatedIds,
      createdAt: new Date().toISOString()
    });
  }

  console.log(`[EventCluster] Created ${clusters.length} event clusters from ${items.length} items`);

  return clusters;
}

/**
 * 从事件簇中提取代表推文列表
 * 用于向后兼容现有的 NewsItem[] 输出格式
 */
export function extractRepresentatives(
  clusters: EventCluster[],
  allItems: NewsItem[]
): NewsItem[] {
  const itemMap = new Map(allItems.map(item => [item.id, item]));

  return clusters
    .map(cluster => itemMap.get(cluster.representativePostId))
    .filter((item): item is NewsItem => item !== undefined);
}
