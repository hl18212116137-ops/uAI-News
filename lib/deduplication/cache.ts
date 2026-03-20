import * as fs from 'fs/promises';
import * as path from 'path';
import { SemanticFingerprint } from './types';

/**
 * 相似度缓存条目
 */
interface SimilarityCacheEntry {
  similarity: number;
  reason: string;
  timestamp: number;
}

/**
 * 语义指纹缓存
 * 存储在 data/semantic-cache.json
 */
export class SemanticCache {
  private cache: Map<string, SemanticFingerprint>;
  private similarityCache: Map<string, SimilarityCacheEntry>;
  private cacheFile: string;
  private similarityCacheFile: string;
  private loaded: boolean = false;
  private similarityLoaded: boolean = false;

  constructor(cacheFilePath: string = 'data/semantic-cache.json') {
    this.cache = new Map();
    this.similarityCache = new Map();
    this.cacheFile = cacheFilePath;
    this.similarityCacheFile = cacheFilePath.replace('.json', '-similarity.json');
  }

  /**
   * 加载缓存文件
   */
  private async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const data = await fs.readFile(this.cacheFile, 'utf-8');
      const parsed = JSON.parse(data);

      for (const [key, value] of Object.entries(parsed)) {
        this.cache.set(key, value as SemanticFingerprint);
      }

      this.loaded = true;
      console.log(`[SemanticCache] Loaded ${this.cache.size} entries from cache`);
    } catch (error) {
      // 文件不存在或解析失败，使用空缓存
      this.loaded = true;
      console.log('[SemanticCache] No existing cache found, starting fresh');
    }
  }

  /**
   * 获取缓存的语义指纹
   */
  async get(postId: string): Promise<SemanticFingerprint | null> {
    await this.load();
    return this.cache.get(postId) || null;
  }

  /**
   * 设置语义指纹缓存
   */
  async set(postId: string, fingerprint: SemanticFingerprint): Promise<void> {
    await this.load();
    this.cache.set(postId, fingerprint);
    await this.persist();
  }

  /**
   * 批量设置
   */
  async setMany(entries: Array<{ postId: string; fingerprint: SemanticFingerprint }>): Promise<void> {
    await this.load();

    for (const { postId, fingerprint } of entries) {
      this.cache.set(postId, fingerprint);
    }

    await this.persist();
  }

  /**
   * 持久化到文件
   */
  private async persist(): Promise<void> {
    try {
      // 确保目录存在
      const dir = path.dirname(this.cacheFile);
      await fs.mkdir(dir, { recursive: true });

      // 写入文件
      const data = Object.fromEntries(this.cache);
      await fs.writeFile(this.cacheFile, JSON.stringify(data, null, 2), 'utf-8');

      console.log(`[SemanticCache] Persisted ${this.cache.size} entries to cache`);
    } catch (error) {
      console.error('[SemanticCache] Failed to persist cache:', error);
    }
  }

  /**
   * 清空缓存
   */
  async clear(): Promise<void> {
    this.cache.clear();
    await this.persist();
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 加载相似度缓存
   */
  private async loadSimilarityCache(): Promise<void> {
    if (this.similarityLoaded) return;

    try {
      const data = await fs.readFile(this.similarityCacheFile, 'utf-8');
      const parsed = JSON.parse(data);

      for (const [key, value] of Object.entries(parsed)) {
        this.similarityCache.set(key, value as SimilarityCacheEntry);
      }

      this.similarityLoaded = true;
      console.log(`[SemanticCache] Loaded ${this.similarityCache.size} similarity entries from cache`);
    } catch (error) {
      this.similarityLoaded = true;
      console.log('[SemanticCache] No existing similarity cache found, starting fresh');
    }
  }

  /**
   * 获取缓存的相似度
   */
  async getSimilarity(cacheKey: string): Promise<SimilarityCacheEntry | null> {
    await this.loadSimilarityCache();
    const entry = this.similarityCache.get(cacheKey);

    // 检查缓存是否过期（7天）
    if (entry && Date.now() - entry.timestamp > 7 * 24 * 60 * 60 * 1000) {
      this.similarityCache.delete(cacheKey);
      return null;
    }

    return entry || null;
  }

  /**
   * 设置相似度缓存
   */
  async setSimilarity(cacheKey: string, similarity: number, reason: string): Promise<void> {
    await this.loadSimilarityCache();
    this.similarityCache.set(cacheKey, {
      similarity,
      reason,
      timestamp: Date.now()
    });
    await this.persistSimilarityCache();
  }

  /**
   * 批量设置相似度缓存
   */
  async setSimilarityMany(entries: Array<{ cacheKey: string; similarity: number; reason: string }>): Promise<void> {
    await this.loadSimilarityCache();

    for (const { cacheKey, similarity, reason } of entries) {
      this.similarityCache.set(cacheKey, {
        similarity,
        reason,
        timestamp: Date.now()
      });
    }

    await this.persistSimilarityCache();
  }

  /**
   * 持久化相似度缓存到文件
   */
  private async persistSimilarityCache(): Promise<void> {
    try {
      const dir = path.dirname(this.similarityCacheFile);
      await fs.mkdir(dir, { recursive: true });

      const data = Object.fromEntries(this.similarityCache);
      await fs.writeFile(this.similarityCacheFile, JSON.stringify(data, null, 2), 'utf-8');

      console.log(`[SemanticCache] Persisted ${this.similarityCache.size} similarity entries to cache`);
    } catch (error) {
      console.error('[SemanticCache] Failed to persist similarity cache:', error);
    }
  }
}
