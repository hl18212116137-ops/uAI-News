import { NewsCategory, PostAnalysis } from '../types';
import { SemanticFingerprint, SimilarityResult } from '../deduplication/types';

/**
 * AI 处理结果类型
 */
export interface AIProcessedContent {
  important: boolean; // AI 判断这条推文是否重要，值得展示给用户
  title: string;
  summary: string;
  category: NewsCategory;
}

/**
 * AI 服务接口
 * 统一的 AI 服务抽象，支持多个 AI 提供商
 */
export interface AIService {
  /**
   * 处理新闻：生成中文标题、摘要和分类
   * @param text 原始文本（英文）
   * @param authorName 作者名称
   * @param authorHandle 作者 handle
   * @returns Promise<AIProcessedContent> AI 处理结果
   */
  processNews(
    text: string,
    authorName: string,
    authorHandle: string
  ): Promise<AIProcessedContent>;

  /**
   * 翻译内容为中文
   * @param content 原始内容（英文）
   * @returns Promise<string> 翻译后的中文内容
   */
  translateContent(content: string): Promise<string>;

  /**
   * 生成博主简介摘要
   * 将原始的博主简介（可能包含URL、表情符号等）转换为简洁的中文摘要
   * @param rawBio 原始博主简介
   * @param authorName 博主名称
   * @param authorHandle 博主handle
   * @returns Promise<string> 简洁的中文简介摘要（20-30字）
   */
  summarizeAuthorBio(
    rawBio: string,
    authorName: string,
    authorHandle: string
  ): Promise<string>;

  /**
   * 获取服务提供商名称
   * @returns string 提供商名称（如 'minimax', 'claude'）
   */
  getProviderName(): string;

  /**
   * 评估新闻的重要性评分
   * @param newsItem 新闻项（包含标题、摘要、内容、分类、作者等信息）
   * @returns Promise<number> 重要性评分（0-100）
   */
  scoreNewsImportance(newsItem: {
    title: string;
    summary: string;
    content: string;
    category: NewsCategory;
    authorName: string;
    authorHandle: string;
    publishedAt: string;
  }): Promise<number>;

  /**
   * 生成新闻的语义指纹
   * 提取主题、实体、事件类型等结构化信息
   * @param newsItem 新闻项（包含标题、摘要、作者等信息）
   * @returns Promise<SemanticFingerprint> 语义指纹
   */
  generateSemanticFingerprint(newsItem: {
    title: string;
    summary: string;
    authorHandle: string;
  }): Promise<SemanticFingerprint>;

  /**
   * 批量比较多条新闻的语义相似度
   * 返回相似度矩阵
   * @param posts 新闻列表
   * @returns Promise<SimilarityResult[]> 相似度结果数组
   */
  compareSimilarityBatch(
    posts: Array<{
      id: string;
      title: string;
      summary: string;
      authorHandle: string;
    }>
  ): Promise<SimilarityResult[]>;

  /**
   * 分析推文（Phase 2 新增）
   * 提取实体、事件类型、来源类型、新颖度等信息
   * @param text 推文文本
   * @param authorName 作者名称
   * @param authorHandle 作者 handle
   * @returns Promise<PostAnalysis> 分析结果
   */
  analyzePost(
    text: string,
    authorName: string,
    authorHandle: string
  ): Promise<PostAnalysis>;
}
