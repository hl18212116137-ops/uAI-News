export type NewsCategory =
  | 'Model Update'
  | 'Product Update'
  | 'Research'
  | 'Company News'
  | 'Funding'
  | 'Policy'
  | 'Open Source'
  | 'Other';

export type NewsSource = {
  platform: 'X' | 'RSS' | 'Blog' | 'YouTube' | 'Reddit';  // 扩展支持多个平台
  name: string;
  handle: string;
  url: string;
};

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  content: string;
  source: NewsSource;
  category: NewsCategory;
  publishedAt: string;
  originalText: string;
  createdAt: string;
  importanceScore?: number; // 0-100，AI评估的重要性评分
};

/**
 * 推文分析结果（Phase 2 新增）
 * 用于事件聚合和去重
 */
export interface PostAnalysis {
  canonicalSummary: string;      // 标准化摘要
  entities: string[];             // 实体（公司/产品/人物）
  eventType: 'announcement' | 'discussion' | 'analysis' | 'reaction' | 'other';
  sourceType: 'official' | 'media' | 'expert' | 'user';
  importanceScore: number;        // 重要性 0-100
  noveltyScore: number;           // 新颖度 0-100
}

/**
 * 事件簇（Phase 2 新增）
 * 用于聚合描述同一事件的多条推文
 */
export interface EventCluster {
  id: string;
  canonicalSummary: string;
  entities: string[];
  eventType: string;
  representativePostId: string;
  relatedPostIds: string[];       // 相关讨论
  createdAt: string;
}

/**
 * 处理状态索引
 * 用于增量处理，跟踪已处理的推文
 */
export interface ProcessedIndex {
  version: string;
  lastProcessedAt: string;
  totalProcessed: number;
  stats: {
    totalRawPosts: number;
    processedPosts: number;
    finalPosts: number;
  };
  index: {
    ids: string[];      // 已处理的推文ID
    urls: string[];     // 已处理的URL
    hashes: string[];   // 已处理的内容哈希
  };
}