import { NewsItem } from '../types';
import { AIService } from '../ai/ai-service';
import { SemanticFingerprint, SimilarityResult } from './types';
import { SemanticCache } from './cache';
import { UnionFind } from './union-find';
import crypto from 'crypto';

/**
 * 日志函数
 */
function log(message: string): void {
  console.log(`[SemanticDedup] ${message}`);
}

/**
 * 语义缓存实例
 */
const semanticCache = new SemanticCache();

/**
 * 生成相似度比较的缓存键
 * 使用两个 ID 的排序组合，确保 (A,B) 和 (B,A) 使用同一个键
 */
function getSimilarityCacheKey(id1: string, id2: string): string {
  const sorted = [id1, id2].sort();
  return crypto.createHash('md5').update(sorted.join('|')).digest('hex');
}

/**
 * 带缓存的相似度批量比较
 * 先检查缓存，只对未缓存的对调用 AI
 */
async function compareSimilarityWithCache(
  posts: Array<{ id: string; title: string; summary: string; authorHandle: string }>,
  aiService: AIService
): Promise<SimilarityResult[]> {
  const results: SimilarityResult[] = [];
  const uncachedPosts: typeof posts = [];
  const cacheHits: Map<string, { id1: string; id2: string }> = new Map();

  // 生成所有可能的配对
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const cacheKey = getSimilarityCacheKey(posts[i].id, posts[j].id);
      const cached = await semanticCache.getSimilarity(cacheKey);

      if (cached) {
        // 使用缓存结果
        results.push({
          id1: posts[i].id,
          id2: posts[j].id,
          similarity: cached.similarity,
          reason: cached.reason
        });
      } else {
        // 记录需要 AI 计算的配对
        cacheHits.set(cacheKey, { id1: posts[i].id, id2: posts[j].id });
      }
    }
  }

  log(`Cache hits: ${results.length}, Cache misses: ${cacheHits.size}`);

  // 如果有未缓存的，调用 AI
  if (cacheHits.size > 0) {
    const aiResults = await aiService.compareSimilarityBatch(posts);

    // 保存到缓存
    const cacheEntries = aiResults.map(result => ({
      cacheKey: getSimilarityCacheKey(result.id1, result.id2),
      similarity: result.similarity,
      reason: result.reason
    }));

    await semanticCache.setSimilarityMany(cacheEntries);

    results.push(...aiResults);
  }

  return results;
}

/**
 * 按时间窗口分组
 * 比较在时间窗口内的新闻（相对于最新帖子，不是相对于"现在"）
 * 移除类别限制，允许跨类别比较
 */
function groupByTimeWindow(
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

  // 返回单个分组（不按类别分组）
  return withinWindow.length > 0 ? [withinWindow] : [];
}

/**
 * 根据相似度结果构建聚类
 * 使用 Union-Find 算法确保聚类结果稳定
 */
function clusterBySimilarity(
  items: NewsItem[],
  similarities: SimilarityResult[],
  threshold: number
): NewsItem[][] {
  // 使用 Union-Find 进行聚类
  const uf = new UnionFind();

  // 添加所有节点
  for (const item of items) {
    uf.add(item.id);
  }

  // 根据相似度合并节点
  for (const sim of similarities) {
    if (sim.similarity >= threshold) {
      uf.union(sim.id1, sim.id2);
    }
  }

  // 获取聚类结果
  const clusterMap = uf.getClusters();
  const clusters: NewsItem[][] = [];

  for (const ids of clusterMap.values()) {
    const cluster = ids
      .map(id => items.find(item => item.id === id))
      .filter((item): item is NewsItem => item !== undefined);

    if (cluster.length > 0) {
      clusters.push(cluster);
    }
  }

  return clusters;
}

/**
 * 计算权威性评分
 * 如果其他推文提到了这个作者，说明这是原始来源
 */
function calculateAuthorityScore(item: NewsItem, cluster: NewsItem[]): number {
  const handle = item.source.handle.toLowerCase();

  // 检查其他推文是否提到了这个 handle
  const mentionCount = cluster.filter(other =>
    other.id !== item.id &&
    (other.originalText.toLowerCase().includes(`@${handle}`) ||
     other.title.includes(item.source.name))
  ).length;

  // 如果被多次提及，说明是原始来源
  if (mentionCount >= 2) return 100;
  if (mentionCount === 1) return 80;

  // 否则根据内容长度判断（原始来源通常更详细）
  const avgLength = cluster.reduce((sum, i) => sum + i.originalText.length, 0) / cluster.length;
  return item.originalText.length >= avgLength ? 60 : 40;
}

/**
 * 计算信息密度评分
 */
function calculateDensityScore(item: NewsItem): number {
  const textLength = item.originalText.length;

  // 基于长度的评分
  let score = Math.min(textLength / 5, 100); // 500字符 = 100分

  // 检查是否包含链接（通常意味着更多信息）
  if (item.originalText.includes('http')) {
    score += 10;
  }

  return Math.min(score, 100);
}

/**
 * 计算时效性评分
 */
function calculateRecencyScore(item: NewsItem, cluster: NewsItem[]): number {
  const itemTime = new Date(item.publishedAt).getTime();
  const times = cluster.map(i => new Date(i.publishedAt).getTime());
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);

  if (maxTime === minTime) return 50;

  // 越新的内容分数越高
  const ratio = (itemTime - minTime) / (maxTime - minTime);
  return ratio * 100;
}

/**
 * 计算综合评分
 */
function calculateCompositeScore(item: NewsItem, cluster: NewsItem[]): number {
  // 权威性：检查是否是原始来源
  const authorityScore = calculateAuthorityScore(item, cluster);

  // 重要性：使用 AI 评估的 importanceScore
  const importanceScore = item.importanceScore || 50;

  // 信息密度：内容长度和质量
  const densityScore = calculateDensityScore(item);

  // 时效性：较新的内容略微加分
  const recencyScore = calculateRecencyScore(item, cluster);

  // 从环境变量读取权重，提供默认值
  const weightAuthority = parseFloat(process.env.SCORE_WEIGHT_AUTHORITY || '0.35');
  const weightImportance = parseFloat(process.env.SCORE_WEIGHT_IMPORTANCE || '0.30');
  const weightDensity = parseFloat(process.env.SCORE_WEIGHT_DENSITY || '0.25');
  const weightRecency = parseFloat(process.env.SCORE_WEIGHT_RECENCY || '0.10');

  return (
    authorityScore * weightAuthority +
    importanceScore * weightImportance +
    densityScore * weightDensity +
    recencyScore * weightRecency
  );
}

/**
 * 从聚类中选择最佳新闻
 */
function selectBestFromCluster(cluster: NewsItem[]): NewsItem {
  if (cluster.length === 1) return cluster[0];

  const scored = cluster.map(item => ({
    item,
    score: calculateCompositeScore(item, cluster)
  }));

  scored.sort((a, b) => b.score - a.score);

  // 记录日志：哪些新闻被合并了
  log(`Merged ${cluster.length} similar posts, kept: ${scored[0].item.id}`);
  cluster.forEach((item, i) => {
    if (i > 0) {
      log(`  - Dropped: ${item.id} (${item.title})`);
    }
  });

  return scored[0].item;
}

/**
 * 语义去重主函数
 */
export async function semanticDeduplicate(
  items: NewsItem[],
  aiService: AIService
): Promise<NewsItem[]> {
  if (items.length < 2) {
    return items;
  }

  log(`Starting semantic deduplication for ${items.length} items`);

  // 1. 预过滤：按时间窗口分组（不按类别）
  const timeWindowHours = parseInt(process.env.SEMANTIC_DEDUP_TIME_WINDOW_HOURS || '48', 10);
  const groups = groupByTimeWindow(items, timeWindowHours);

  log(`Grouped into ${groups.length} time window groups`);

  const allDeduplicated: NewsItem[] = [];

  // 2. 对每个组进行语义去重（分批处理）
  for (const group of groups) {
    if (group.length < 2) {
      allDeduplicated.push(...group);
      continue;
    }

    try {
      const batchSize = parseInt(process.env.SEMANTIC_DEDUP_BATCH_SIZE || '20', 10);

      // 如果组内新闻数量较少，直接处理
      if (group.length <= batchSize) {
        // 使用带缓存的相似度比较
        let similarities: SimilarityResult[] = [];
        let retries = 0;
        const maxRetries = 2;

        while (retries <= maxRetries) {
          try {
            similarities = await compareSimilarityWithCache(
              group.map(item => ({
                id: item.id,
                title: item.title,
                summary: item.summary,
                authorHandle: item.source.handle
              })),
              aiService
            );

            if (similarities.length > 0) break;

            if (retries < maxRetries) {
              log(`AI service returned empty result, retrying (${retries + 1}/${maxRetries})...`);
              retries++;
              await new Promise(resolve => setTimeout(resolve, 1000 * retries)); // 指数退避
            } else {
              break;
            }
          } catch (error) {
            if (retries < maxRetries) {
              log(`AI service error, retrying (${retries + 1}/${maxRetries}): ${error}`);
              retries++;
              await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            } else {
              log(`AI service failed after ${maxRetries} retries: ${error}`);
              throw error;
            }
          }
        }

        log(`Found ${similarities.length} similar pairs in group of ${group.length}`);

        const threshold = parseInt(process.env.SEMANTIC_DEDUP_SIMILARITY_THRESHOLD || '75', 10);
        const clusters = clusterBySimilarity(group, similarities, threshold);
        const deduplicated = clusters.map(cluster => selectBestFromCluster(cluster));
        allDeduplicated.push(...deduplicated);
      } else {
        // 分批处理大组
        log(`Group has ${group.length} items, splitting into batches of ${batchSize}`);

        const allSimilarities: SimilarityResult[] = [];

        // 将组分成多个批次，使用滑动窗口确保相邻批次有重叠
        const overlapSize = parseInt(process.env.SEMANTIC_DEDUP_OVERLAP_SIZE || '10', 10);
        for (let i = 0; i < group.length; i += batchSize) {
          const batchEnd = Math.min(i + batchSize + overlapSize, group.length); // 可配置重叠（默认10）
          const batch = group.slice(i, batchEnd);

          log(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i}-${batchEnd - 1}`);

          // 使用带缓存的相似度比较
          let batchSimilarities: SimilarityResult[] = [];
          let retries = 0;
          const maxRetries = 2;

          while (retries <= maxRetries) {
            try {
              batchSimilarities = await compareSimilarityWithCache(
                batch.map(item => ({
                  id: item.id,
                  title: item.title,
                  summary: item.summary,
                  authorHandle: item.source.handle
                })),
                aiService
              );

              if (batchSimilarities.length > 0) break;

              if (retries < maxRetries) {
                log(`Batch AI service returned empty result, retrying (${retries + 1}/${maxRetries})...`);
                retries++;
                await new Promise(resolve => setTimeout(resolve, 1000 * retries));
              } else {
                break;
              }
            } catch (error) {
              if (retries < maxRetries) {
                log(`Batch AI service error, retrying (${retries + 1}/${maxRetries}): ${error}`);
                retries++;
                await new Promise(resolve => setTimeout(resolve, 1000 * retries));
              } else {
                log(`Batch AI service failed after ${maxRetries} retries: ${error}`);
                throw error;
              }
            }
          }

          allSimilarities.push(...batchSimilarities);
        }

        log(`Found ${allSimilarities.length} similar pairs across all batches`);

        const threshold = parseInt(process.env.SEMANTIC_DEDUP_SIMILARITY_THRESHOLD || '75', 10);
        const clusters = clusterBySimilarity(group, allSimilarities, threshold);
        const deduplicated = clusters.map(cluster => selectBestFromCluster(cluster));
        allDeduplicated.push(...deduplicated);
      }
    } catch (error) {
      log(`Error processing group: ${error}`);
      // 出错时保留原始组
      allDeduplicated.push(...group);
    }
  }

  // 添加时间窗口外的新闻（未处理的）
  const latestTime = Math.max(...items.map(item => new Date(item.publishedAt).getTime()));
  const windowMs = timeWindowHours * 60 * 60 * 1000;
  const outsideWindow = items.filter(item => {
    const publishedTime = new Date(item.publishedAt).getTime();
    const age = latestTime - publishedTime;
    return age > windowMs;
  });

  allDeduplicated.push(...outsideWindow);

  log(`Semantic deduplication complete: ${items.length} -> ${allDeduplicated.length}`);

  return allDeduplicated;
}
