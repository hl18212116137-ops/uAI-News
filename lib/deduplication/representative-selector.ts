import { NewsItem } from '../types';

/**
 * 代表内容选择模块
 * 从事件簇中选择最优的代表推文
 */

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
export function calculateCompositeScore(item: NewsItem, cluster: NewsItem[]): number {
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
export function selectBestFromCluster(cluster: NewsItem[]): NewsItem {
  if (cluster.length === 1) return cluster[0];

  const scored = cluster.map(item => ({
    item,
    score: calculateCompositeScore(item, cluster)
  }));

  scored.sort((a, b) => b.score - a.score);

  // 记录日志：哪些新闻被合并了
  console.log(`[RepresentativeSelector] Merged ${cluster.length} similar posts, kept: ${scored[0].item.id}`);
  cluster.forEach((item, i) => {
    if (i > 0) {
      console.log(`  - Dropped: ${item.id} (${item.title})`);
    }
  });

  return scored[0].item;
}

/**
 * 选择代表推文（带详细评分信息）
 */
export function selectRepresentativeWithDetails(cluster: NewsItem[]): {
  representative: NewsItem;
  scores: Array<{
    item: NewsItem;
    totalScore: number;
    authorityScore: number;
    importanceScore: number;
    densityScore: number;
    recencyScore: number;
  }>;
} {
  if (cluster.length === 1) {
    return {
      representative: cluster[0],
      scores: [{
        item: cluster[0],
        totalScore: 100,
        authorityScore: 100,
        importanceScore: cluster[0].importanceScore || 50,
        densityScore: 100,
        recencyScore: 100
      }]
    };
  }

  const weightAuthority = parseFloat(process.env.SCORE_WEIGHT_AUTHORITY || '0.35');
  const weightImportance = parseFloat(process.env.SCORE_WEIGHT_IMPORTANCE || '0.30');
  const weightDensity = parseFloat(process.env.SCORE_WEIGHT_DENSITY || '0.25');
  const weightRecency = parseFloat(process.env.SCORE_WEIGHT_RECENCY || '0.10');

  const scores = cluster.map(item => {
    const authorityScore = calculateAuthorityScore(item, cluster);
    const importanceScore = item.importanceScore || 50;
    const densityScore = calculateDensityScore(item);
    const recencyScore = calculateRecencyScore(item, cluster);

    const totalScore = (
      authorityScore * weightAuthority +
      importanceScore * weightImportance +
      densityScore * weightDensity +
      recencyScore * weightRecency
    );

    return {
      item,
      totalScore,
      authorityScore,
      importanceScore,
      densityScore,
      recencyScore
    };
  });

  scores.sort((a, b) => b.totalScore - a.totalScore);

  return {
    representative: scores[0].item,
    scores
  };
}
