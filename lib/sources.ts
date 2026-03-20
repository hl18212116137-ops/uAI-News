import 'server-only';
import fs from 'fs/promises';
import path from 'path';

/**
 * 源（博主/频道）类型定义
 * 支持多平台和多种抓取方式（为未来扩展预留）
 */
export type PlatformType = 'X' | 'YouTube' | 'Reddit' | 'RSS' | 'Blog';
export type FetchMethod = 'api' | 'rss' | 'scraper' | 'webhook';
export type SourceType = 'blogger' | 'media' | 'academic';  // 区分博主、媒体和学术网站

export interface Source {
  id: string;              // 唯一标识（使用handle作为ID）
  sourceType: SourceType;  // 新增：源类型（博主或媒体）
  platform: PlatformType;  // 平台类型
  handle: string;          // 用户名（如 sama）
  name: string;            // 显示名称（如 Sam Altman）
  url: string;             // 主页链接
  avatar?: string;         // 头像URL（可选）
  description?: string;    // 博主简介（可选，手动配置，不随抓取更新）
  enabled: boolean;        // 是否启用
  addedAt: string;         // 添加时间
  lastFetchedAt?: string;  // 最后抓取时间

  // 抓取配置（为未来多种抓取方式预留）
  fetchConfig?: {
    method: FetchMethod;   // 抓取方式
    interval?: number;     // 抓取间隔（分钟），默认60
  };
}

const SOURCES_FILE = path.join(process.cwd(), 'data', 'sources.json');

/**
 * 确保data目录存在
 */
async function ensureDataDir(): Promise<void> {
  const dataDir = path.join(process.cwd(), 'data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

/**
 * 读取所有源
 */
export async function getSources(): Promise<Source[]> {
  try {
    const content = await fs.readFile(SOURCES_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * 保存源列表
 */
async function saveSources(sources: Source[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(SOURCES_FILE, JSON.stringify(sources, null, 2), 'utf-8');
}

/**
 * 从URL提取源信息
 * 支持推文链接和主页链接
 */
export async function extractSourceFromUrl(url: string): Promise<Partial<Source>> {
  // 规范化URL
  const normalizedUrl = url.trim().toLowerCase();

  // 检测平台
  let platform: PlatformType;
  let handle: string;
  let profileUrl: string;
  let name: string;
  let avatar: string | undefined;
  let description: string | undefined;  // 新增：博主简介

  // X / Twitter
  if (normalizedUrl.includes('x.com') || normalizedUrl.includes('twitter.com')) {
    platform = 'X';

    // 提取handle
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);

    if (pathParts.length === 0) {
      throw new Error('无法从URL中提取用户名');
    }

    handle = pathParts[0];
    profileUrl = `https://x.com/${handle}`;

    // 通过API获取用户真实名称
    try {
      const { fetchUserInfoFromX } = await import('./x');
      const userInfo = await fetchUserInfoFromX(handle);
      name = userInfo.name;
      avatar = userInfo.avatar;
      description = userInfo.description;  // 提取博主简介
    } catch (error) {
      console.error('Failed to fetch user info, using handle as name:', error);
      name = handle; // 降级方案：使用handle作为名称
    }
  } else {
    throw new Error('暂不支持该平台');
  }

  return {
    id: `${platform.toLowerCase()}-${handle}`,
    sourceType: 'blogger',  // 新增：X 平台的源类型为 blogger
    platform,
    handle,
    name,
    avatar,
    description,  // 添加博主简介
    url: profileUrl,
    enabled: true,
    addedAt: new Date().toISOString(),
    fetchConfig: {
      method: 'api',
      interval: 60,
    },
  };
}

/**
 * 添加源
 */
export async function addSource(source: Source): Promise<void> {
  const sources = await getSources();

  // 检查是否已存在
  const exists = sources.some(s => s.id === source.id);
  if (exists) {
    throw new Error(`博主 @${source.handle} 已存在`);
  }

  sources.push(source);
  await saveSources(sources);
}

/**
 * 删除源
 */
export async function deleteSource(id: string): Promise<void> {
  const sources = await getSources();
  const filtered = sources.filter(s => s.id !== id);

  if (filtered.length === sources.length) {
    throw new Error('源不存在');
  }

  await saveSources(filtered);
}

/**
 * 更新源
 */
export async function updateSource(id: string, updates: Partial<Source>): Promise<void> {
  const sources = await getSources();
  const index = sources.findIndex(s => s.id === id);

  if (index === -1) {
    throw new Error('源不存在');
  }

  sources[index] = { ...sources[index], ...updates };
  await saveSources(sources);
}

/**
 * 获取单个源
 */
export async function getSourceById(id: string): Promise<Source | null> {
  const sources = await getSources();
  return sources.find(s => s.id === id) || null;
}
