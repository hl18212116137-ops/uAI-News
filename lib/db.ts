import 'server-only';
import fs from 'fs/promises';
import path from 'path';
import { NewsItem, NewsCategory } from './types';
import { postsCache } from './db-cache';

/**
 * 验证数据是否符合 NewsItem 类型
 * @param data 待验证的数据
 * @returns 是否为有效的 NewsItem
 */
function isValidNewsItem(data: any): data is NewsItem {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.id === 'string' &&
    typeof data.title === 'string' &&
    typeof data.summary === 'string' &&
    typeof data.content === 'string' &&
    typeof data.source === 'object' &&
    typeof data.category === 'string' &&
    typeof data.publishedAt === 'string' &&
    typeof data.originalText === 'string' &&
    typeof data.createdAt === 'string'
  );
}

/**
 * 验证数组中的所有项是否都是有效的 NewsItem
 * @param data 待验证的数组
 * @returns 过滤后的有效 NewsItem 数组
 */
function validateNewsItems(data: any[]): NewsItem[] {
  if (!Array.isArray(data)) {
    logError('数据格式错误：不是数组');
    return [];
  }

  const validItems = data.filter((item, index) => {
    const isValid = isValidNewsItem(item);
    if (!isValid) {
      logWarning(`数据项 ${index} 格式不正确，已跳过`);
    }
    return isValid;
  });

  return validItems;
}

/**
 * 日志函数 - 警告级别
 * 生产环境可替换为日志库（如 winston）
 */
function logWarning(message: string, meta?: any) {
  if (process.env.NODE_ENV === 'production') {
    // 生产环境：使用日志库或不输出敏感信息
    // 例如：logger.warn(message, meta);
    return;
  }
  console.warn(`[DB Warning] ${message}`, meta || '');
}

/**
 * 日志函数 - 错误级别
 * 生产环境可替换为日志库（如 winston）
 */
function logError(message: string, error?: any) {
  if (process.env.NODE_ENV === 'production') {
    // 生产环境：使用日志库或不输出敏感信息
    // 例如：logger.error(message, { error: error?.message });
    return;
  }
  console.error(`[DB Error] ${message}`, error || '');
}

/**
 * 异步读取 processed-posts.json（带缓存）
 * 如果文件不存在或解析失败，返回空数组
 * @returns Promise<NewsItem[]> 新闻数组
 */
export async function getAllPosts(): Promise<NewsItem[]> {
  try {
    // 使用缓存读取
    const parsedData = await postsCache.getPosts();

    // 验证数据类型
    const validatedPosts = validateNewsItems(parsedData);

    if (validatedPosts.length === 0 && parsedData.length > 0) {
      logWarning('所有数据项都不符合 NewsItem 类型，返回空数组');
    }

    return validatedPosts;
  } catch (error: any) {
    // 处理 JSON 解析错误
    if (error instanceof SyntaxError) {
      logError('JSON 解析失败，文件格式可能有误', error);
      return [];
    }

    // 其他错误
    logError('读取 processed-posts.json 失败', error);
    return [];
  }
}
/**
 * 按 URL 查询新闻项
 * @param url 原始 URL
 * @returns Promise<NewsItem | null> 找到的新闻项或 null
 */
export async function getPostByUrl(url: string): Promise<NewsItem | null> {
  const posts = await getAllPosts();
  return posts.find(post => post.source.url === url) || null;
}

/**
 * 按 ID 查询新闻项
 * @param id 新闻 ID
 * @returns Promise<NewsItem | null> 找到的新闻项或 null
 */
export async function getPostById(id: string): Promise<NewsItem | null> {
  const posts = await getAllPosts();
  return posts.find(post => post.id === id) || null;
}

/**
 * 添加新闻项到数据库
 * @param post 新闻项
 * @returns Promise<void>
 */
export async function addPost(post: NewsItem): Promise<void> {
  try {
    const dbPath = path.join(process.cwd(), 'data', 'processed-posts.json');

    // 确保 data 目录存在
    const dataDir = path.join(process.cwd(), 'data');
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }

    // 读取现有数据
    let posts: NewsItem[] = []
    try {
      const fileContent = await fs.readFile(dbPath, 'utf-8');
      posts = JSON.parse(fileContent);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // 文件不存在，使用空数组
    }

    // 添加新项到数组开头（最新的在前）
    posts.unshift(post);

    // 写入文件
    await fs.writeFile(dbPath, JSON.stringify(posts, null, 2), 'utf-8');

    // 清除缓存
    postsCache.invalidate();
  } catch (error) {
    logError('添加新闻项失败', error);
    throw error;
  }
}

export async function deletePostsByHandle(handle: string): Promise<number> {
  const dbPath = path.join(process.cwd(), 'data', 'processed-posts.json');
  const posts = await getAllPosts();
  const lowerHandle = handle.toLowerCase();
  const filtered = posts.filter(post => {
    if (post.source && typeof post.source === 'object') {
      const sourceHandle = post.source.handle;
      return sourceHandle && sourceHandle.toLowerCase() !== lowerHandle;
    }
    return true;
  });
  const deletedCount = posts.length - filtered.length;
  if (deletedCount > 0) {
    await fs.writeFile(dbPath, JSON.stringify(filtered, null, 2), 'utf-8');
    postsCache.invalidate();
  }
  return deletedCount;
}
