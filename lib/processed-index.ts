import fs from 'fs/promises';
import path from 'path';
import { ProcessedIndex } from './types';

const INDEX_PATH = path.join(process.cwd(), 'data', 'processed-index.json');

export class ProcessedIndexManager {
  public index: ProcessedIndex;
  private idsSet: Set<string>;
  private urlsSet: Set<string>;
  private hashesSet: Set<string>;

  constructor(index?: ProcessedIndex) {
    this.index = index || this.createEmptyIndex();
    this.idsSet = new Set(this.index.index.ids);
    this.urlsSet = new Set(this.index.index.urls);
    this.hashesSet = new Set(this.index.index.hashes);
  }

  private createEmptyIndex(): ProcessedIndex {
    return {
      version: '1.0',
      lastProcessedAt: new Date().toISOString(),
      totalProcessed: 0,
      stats: {
        totalRawPosts: 0,
        processedPosts: 0,
        finalPosts: 0,
      },
      index: {
        ids: [],
        urls: [],
        hashes: [],
      },
    };
  }

  hasId(id: string): boolean {
    return this.idsSet.has(id);
  }

  hasUrl(url: string): boolean {
    return this.urlsSet.has(url);
  }

  hasHash(hash: string): boolean {
    return this.hashesSet.has(hash);
  }

  addId(id: string): void {
    if (!this.idsSet.has(id)) {
      this.idsSet.add(id);
      this.index.index.ids.push(id);
    }
  }

  addUrl(url: string): void {
    if (!this.urlsSet.has(url)) {
      this.urlsSet.add(url);
      this.index.index.urls.push(url);
    }
  }

  addHash(hash: string): void {
    if (!this.hashesSet.has(hash)) {
      this.hashesSet.add(hash);
      this.index.index.hashes.push(hash);
    }
  }

  removeId(id: string): void {
    if (this.idsSet.has(id)) {
      this.idsSet.delete(id);
      this.index.index.ids = this.index.index.ids.filter(i => i !== id);
    }
  }

  updateStats(stats: Partial<ProcessedIndex['stats']>): void {
    this.index.stats = { ...this.index.stats, ...stats };
    this.index.lastProcessedAt = new Date().toISOString();
  }

  async save(): Promise<void> {
    await fs.writeFile(INDEX_PATH, JSON.stringify(this.index, null, 2), 'utf-8');
  }

  static async load(): Promise<ProcessedIndexManager> {
    try {
      const content = await fs.readFile(INDEX_PATH, 'utf-8');
      const index = JSON.parse(content);
      return new ProcessedIndexManager(index);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // 索引文件不存在，创建新的
        return new ProcessedIndexManager();
      }
      throw error;
    }
  }
}
