/**
 * 导入模块的类型定义
 */

import type { XReferencedPost } from '@/lib/types';

/**
 * 支持的平台类型
 */
export type PlatformType = 'X' | 'YouTube' | 'Reddit' | 'Blog' | 'WebPage' | 'Unknown';

/**
 * URL 规范化结果
 */
export interface NormalizedUrl {
  original: string;        // 原始 URL
  normalized: string;      // 规范化后的 URL
  platform: PlatformType;  // 识别的平台
  isValid: boolean;        // 是否有效
  error?: string;          // 错误信息
}

/**
 * 平台内容的原始数据（解析器返回）
 */
export interface ParsedContent {
  externalId: string;      // 平台上的唯一 ID
  title?: string;          // 标题（可选）
  content: string;         // 正文内容
  author: {
    name: string;          // 作者名称
    handle?: string;       // 作者账号（如 @username）
    url?: string;          // 作者主页 URL
  };
  publishedAt: string;     // 发布时间（ISO 8601 格式）
  url: string;             // 内容的原始 URL
  platform: PlatformType;  // 平台类型
  rawData?: any;           // 原始数据（用于调试或未来扩展）
  /** X 被转 / 被引内层（可选） */
  referencedPost?: XReferencedPost;
}

/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean;
  message: string;
  postId?: string;         // 成功时返回新闻 ID（与 raw id 一致，入队时尚未写入 news_items）
  isDuplicate?: boolean;   // 是否为重复内容
  error?: string;          // 错误信息
  /** PROCESSING_JOBS_ENABLED 时仅解析+入 raw/jobs，不再同步跑 AI */
  queued?: boolean;
  rawPostId?: string;
}
