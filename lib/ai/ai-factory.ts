import { AIService, AIProcessedContent } from './ai-service';
import { NewsCategory } from '../types';
import { MinimaxService } from './minimax-service';
import { ClaudeService } from './claude-service';
import { SemanticFingerprint, SimilarityResult } from '../deduplication/types';

export type AIProvider = 'minimax' | 'claude';

/**
 * AI 服务工厂
 * 支持多个 AI 提供商，带降级策略和重试机制
 */
export class AIServiceFactory {
  /**
   * 创建 AI 服务实例
   * @param provider AI 提供商（默认从环境变量读取）
   * @returns AIService 实例
   */
  static create(provider?: AIProvider): AIService {
    const selectedProvider = provider || (process.env.AI_PROVIDER as AIProvider) || 'minimax';

    switch (selectedProvider) {
      case 'claude':
        return new ClaudeService();
      case 'minimax':
        return new MinimaxService();
      default:
        console.warn(`Unknown AI provider: ${selectedProvider}, falling back to minimax`);
        return new MinimaxService();
    }
  }

  /**
   * 创建带降级策略的 AI 服务
   * 如果主服务失败，自动切换到备用服务
   * @param primaryProvider 主服务提供商
   * @param fallbackProvider 备用服务提供商
   * @returns AIService 实例
   */
  static createWithFallback(
    primaryProvider?: AIProvider,
    fallbackProvider?: AIProvider
  ): AIService {
    const primary = primaryProvider || (process.env.AI_PROVIDER as AIProvider) || 'minimax';
    const fallback = fallbackProvider || (primary === 'minimax' ? 'claude' : 'minimax');

    return new AIServiceWithFallback(
      this.create(primary),
      this.create(fallback)
    );
  }
}

/**
 * 带降级策略的 AI 服务包装器
 */
class AIServiceWithFallback implements AIService {
  constructor(
    private primaryService: AIService,
    private fallbackService: AIService
  ) {}

  async processNews(
    text: string,
    authorName: string,
    authorHandle: string
  ): Promise<AIProcessedContent> {
    try {
      return await this.retryWithExponentialBackoff(
        () => this.primaryService.processNews(text, authorName, authorHandle),
        3 // 最多重试 3 次
      );
    } catch (primaryError) {
      console.warn(
        `Primary AI service (${this.primaryService.getProviderName()}) failed, falling back to ${this.fallbackService.getProviderName()}`,
        primaryError
      );

      try {
        return await this.retryWithExponentialBackoff(
          () => this.fallbackService.processNews(text, authorName, authorHandle),
          2 // 备用服务重试 2 次
        );
      } catch (fallbackError) {
        console.error('Both AI services failed:', { primaryError, fallbackError });
        throw new Error('All AI services failed');
      }
    }
  }

  async translateContent(content: string): Promise<string> {
    try {
      return await this.retryWithExponentialBackoff(
        () => this.primaryService.translateContent(content),
        3
      );
    } catch (primaryError) {
      console.warn(
        `Primary AI service (${this.primaryService.getProviderName()}) failed, falling back to ${this.fallbackService.getProviderName()}`,
        primaryError
      );

      try {
        return await this.retryWithExponentialBackoff(
          () => this.fallbackService.translateContent(content),
          2
        );
      } catch (fallbackError) {
        console.error('Both AI services failed:', { primaryError, fallbackError });
        throw new Error('All AI services failed');
      }
    }
  }

  getProviderName(): string {
    return `${this.primaryService.getProviderName()} (fallback: ${this.fallbackService.getProviderName()})`;
  }

  async scoreNewsImportance(newsItem: {
    title: string;
    summary: string;
    content: string;
    category: NewsCategory;
    authorName: string;
    authorHandle: string;
    publishedAt: string;
  }): Promise<number> {
    try {
      return await this.retryWithExponentialBackoff(
        () => this.primaryService.scoreNewsImportance(newsItem),
        3
      );
    } catch (primaryError) {
      console.warn(
        `Primary AI service (${this.primaryService.getProviderName()}) failed, falling back to ${this.fallbackService.getProviderName()}`,
        primaryError
      );

      try {
        return await this.retryWithExponentialBackoff(
          () => this.fallbackService.scoreNewsImportance(newsItem),
          2
        );
      } catch (fallbackError) {
        console.error('Both AI services failed:', { primaryError, fallbackError });
        // 降级方案：返回默认评分
        return 50;
      }
    }
  }

  async generateSemanticFingerprint(newsItem: {
    title: string;
    summary: string;
    authorHandle: string;
  }): Promise<SemanticFingerprint> {
    try {
      return await this.retryWithExponentialBackoff(
        () => this.primaryService.generateSemanticFingerprint(newsItem),
        3
      );
    } catch (primaryError) {
      console.warn(
        `Primary AI service (${this.primaryService.getProviderName()}) failed, falling back to ${this.fallbackService.getProviderName()}`,
        primaryError
      );

      try {
        return await this.retryWithExponentialBackoff(
          () => this.fallbackService.generateSemanticFingerprint(newsItem),
          2
        );
      } catch (fallbackError) {
        console.error('Both AI services failed:', { primaryError, fallbackError });
        // 降级方案：返回基础指纹
        return {
          mainTopic: newsItem.title.substring(0, 20),
          entities: {
            people: [],
            companies: [],
            products: [],
            concepts: []
          },
          eventType: 'discussion'
        };
      }
    }
  }

  async compareSimilarityBatch(
    posts: Array<{
      id: string;
      title: string;
      summary: string;
      authorHandle: string;
    }>
  ): Promise<SimilarityResult[]> {
    try {
      return await this.retryWithExponentialBackoff(
        () => this.primaryService.compareSimilarityBatch(posts),
        3
      );
    } catch (primaryError) {
      console.warn(
        `Primary AI service (${this.primaryService.getProviderName()}) failed, falling back to ${this.fallbackService.getProviderName()}`,
        primaryError
      );

      try {
        return await this.retryWithExponentialBackoff(
          () => this.fallbackService.compareSimilarityBatch(posts),
          2
        );
      } catch (fallbackError) {
        console.error('Both AI services failed:', { primaryError, fallbackError });
        // 降级方案：返回空数组（不进行语义去重）
        return [];
      }
    }
  }

  async analyzePost(
    text: string,
    authorName: string,
    authorHandle: string
  ): Promise<import('../types').PostAnalysis> {
    try {
      return await this.retryWithExponentialBackoff(
        () => this.primaryService.analyzePost(text, authorName, authorHandle),
        3
      );
    } catch (primaryError) {
      console.warn(
        `Primary AI service (${this.primaryService.getProviderName()}) failed, falling back to ${this.fallbackService.getProviderName()}`,
        primaryError
      );

      try {
        return await this.retryWithExponentialBackoff(
          () => this.fallbackService.analyzePost(text, authorName, authorHandle),
          2
        );
      } catch (fallbackError) {
        console.error('Both AI services failed:', { primaryError, fallbackError });
        // 降级方案：返回基本信息
        return {
          canonicalSummary: text.substring(0, 50),
          entities: [],
          eventType: 'other',
          sourceType: 'user',
          importanceScore: 50,
          noveltyScore: 50
        };
      }
    }
  }

  async summarizeAuthorBio(
    rawBio: string,
    authorName: string,
    authorHandle: string
  ): Promise<string> {
    try {
      return await this.retryWithExponentialBackoff(
        () => this.primaryService.summarizeAuthorBio(rawBio, authorName, authorHandle),
        3
      );
    } catch (primaryError) {
      console.warn(
        `Primary AI service (${this.primaryService.getProviderName()}) failed, falling back to ${this.fallbackService.getProviderName()}`,
        primaryError
      );

      try {
        return await this.retryWithExponentialBackoff(
          () => this.fallbackService.summarizeAuthorBio(rawBio, authorName, authorHandle),
          2
        );
      } catch (fallbackError) {
        console.error('Both AI services failed:', { primaryError, fallbackError });
        // 降级方案：使用原始简介的前30个字符
        return rawBio.substring(0, 30).replace(/https?:\/\/\S+/g, '').trim();
      }
    }
  }

  /**
   * 指数退避重试机制
   * @param fn 要执行的函数
   * @param maxRetries 最大重试次数
   * @param baseDelay 基础延迟时间（毫秒）
   * @returns Promise<T> 函数执行结果
   */
  private async retryWithExponentialBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // 如果是最后一次尝试，直接抛出错误
        if (attempt === maxRetries) {
          break;
        }

        // 计算延迟时间：baseDelay * 2^attempt
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, error.message);

        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Unknown error during retry');
  }
}

/**
 * 获取默认的 AI 服务实例（带降级策略）
 * @returns AIService 实例
 */
export function getDefaultAIService(): AIService {
  return AIServiceFactory.createWithFallback();
}
