export type NewsCategory =
  | 'Model Update'
  | 'Product Update'
  | 'Research'
  | 'Company News'
  | 'Funding'
  | 'Policy'
  | 'Open Source'
  | 'Other';

/** 分类英文→中文映射表（全项目共享，请从此处 import） */
export const CATEGORY_ZH_MAP: Record<NewsCategory, string> = {
  'Model Update':   '模型更新',
  'Product Update': '产品发布',
  'Research':       '研究进展',
  'Company News':   '行业动态',
  'Funding':        '融资',
  'Policy':         '政策',
  'Open Source':    '开源',
  'Other':          '其他',
};

export type NewsSource = {
  platform: 'X' | 'RSS' | 'Blog' | 'YouTube' | 'Reddit';  // 扩展支持多个平台
  name: string;
  handle: string;
  url: string;
  /** 来自 sources 表，用于信息流展示 */
  avatar?: string;
  description?: string;
};

/** 推文互动（主要来自 X public_metrics 等，可部分缺省） */
export type SocialEngagement = {
  replyCount?: number;
  retweetCount?: number;
  likeCount?: number;
  quoteCount?: number;
  bookmarkCount?: number;
  impressionCount?: number;
};

/**
 * X 嵌套推文（TwitterAPI.io：`retweeted_tweet` / `quoted_tweet`）
 * 用于 ORIGINAL 分区展示与双层译文。
 */
export type XReferencedPost = {
  kind: 'retweet' | 'quote';
  id?: string;
  text: string;
  userName?: string;
  name?: string;
  mediaUrls?: string[];
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
  /** X 等媒体 URL（仅 https），INSIGHT 内展示用 */
  mediaUrls?: string[];
  /** 抓取时的互动数据（INSIGHT / 详情可用） */
  socialEngagement?: SocialEngagement;
  /** 被转发 / 被引用的内层推文（仅 X） */
  referencedPost?: XReferencedPost;
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
  /** 推文中文译文；外文译成中文，已是中文可与原文一致或略述 */
  translatedText?: string;
  /** 嵌套推文（被转/被引原文）的完整中文译文 */
  translatedTextReferenced?: string;
  /** KEY POINTS：最多 3 条口语短句；每条最多一处 **关键词** 加粗；解析失败时可缺省 */
  highlights?: string[];
  /** 单句：只说明与这位用户（画像/订阅）的关系；约 35 字内；可选一处 **关键词** 加粗 */
  relevance?: string;
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

/** INSIGHT 面板 API 返回结构（与 news_items.insight_json 分桶值一致） */
export type InsightAnalysisPayload = {
  scores: number | null;
  reliability: number | null;
  review: string[] | null;
  contextMatch: string | null;
  originalTranslation: string | null;
  /** 嵌套推文正文的中文译文（无嵌套时为 null） */
  originalTranslationReferenced: string | null;
};