/**
 * 文件缓存机制
 * 缓存 processed-posts.json 的内容，避免重复读取文件
 */

import fs from 'fs/promises';
import path from 'path';
import { NewsItem } from './types';

class PostsCache {
  private cache: NewsItem[] | null = null;
  private lastModified: number = 0;
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = path.join(process.cwd(), filePath);
  }

  /**
   * 获取推文数据（带缓存）
   * @returns 推文数组
   */
  async getPosts(): Promise<NewsItem[]> {
    try {
      const stats = await fs.stat(this.filePath);

      // 如果文件未修改，返回缓存
      if (this.cache && stats.mtimeMs === this.lastModified) {
        return this.cache;
      }

      // 读取文件并更新缓存
      const content = await fs.readFile(this.filePath, 'utf-8');
      this.cache = JSON.parse(content);
      this.lastModified = stats.mtimeMs;

      return this.cache || [];
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // 文件不存在，返回空数组
        return [];
      }
      throw error;
    }
  }

  /**
   * 清除缓存（在写入文件后调用）
   */
  invalidate(): void {
    this.cache = null;
    this.lastModified = 0;
  }
}

// 导出单例
export const postsCache = new PostsCache('data/processed-posts.json');
