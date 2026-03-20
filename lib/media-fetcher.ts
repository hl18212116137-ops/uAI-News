/**
 * 媒体数据源抓取模块
 *
 * 支持：
 * 1. RSS 源解析（优先）
 * 2. 网页抓取（备选）
 *
 * 统一返回 NewsItem 格式
 */

import { NewsItem } from './types';

/**
 * RSS 项目接口
 */
interface RSSItem {
  title?: string;
  description?: string;
  content?: string;
  link?: string;
  pubDate?: string;
  author?: string;
  guid?: string;
}

/**
 * 从 RSS 源抓取新闻
 * @param rssUrl RSS 源 URL
 * @param mediaName 媒体名称
 * @param mediaHandle 媒体 handle
 * @returns 新闻项目数组
 */
export async function fetchFromRSS(
  rssUrl: string,
  mediaName: string,
  mediaHandle: string
): Promise<NewsItem[]> {
  try {
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; uAI-NewsBot/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();

    // 简单的 RSS 解析（使用正则表达式）
    // 注：生产环境建议使用专业的 RSS 解析库如 rss-parser
    const items = parseRSSItems(text);

    // 转换为 NewsItem 格式
    return items.map((item, index) => ({
      id: `media-${mediaHandle}-${Date.now()}-${index}`,
      title: item.title || '无标题',
      summary: stripHtml(item.description || item.content || ''),
      content: item.content || item.description || '',
      source: {
        platform: 'RSS',
        name: mediaName,
        handle: mediaHandle,
        url: item.link || rssUrl,
      },
      category: 'Other', // 媒体源默认分类为 Other，可后续通过 AI 分类
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      originalText: item.description || item.content || '',
      createdAt: new Date().toISOString(),
      importanceScore: 50, // 默认评分，可后续通过 AI 评估
    }));
  } catch (error) {
    console.error(`❌ 从 RSS 源 ${rssUrl} 抓取失败:`, error);
    return [];
  }
}

/**
 * 简单的 RSS 项目解析
 * @param rssText RSS XML 文本
 * @returns RSS 项目数组
 */
function parseRSSItems(rssText: string): RSSItem[] {
  const items: RSSItem[] = [];

  // 匹配 <item> 标签
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(rssText)) !== null) {
    const itemContent = match[1];

    // 提取各个字段
    const title = extractXMLValue(itemContent, 'title');
    const description = extractXMLValue(itemContent, 'description');
    const content = extractXMLValue(itemContent, 'content:encoded') || description;
    const link = extractXMLValue(itemContent, 'link');
    const pubDate = extractXMLValue(itemContent, 'pubDate');
    const author = extractXMLValue(itemContent, 'author');
    const guid = extractXMLValue(itemContent, 'guid');

    items.push({
      title,
      description,
      content,
      link,
      pubDate,
      author,
      guid,
    });
  }

  return items;
}

/**
 * 从 XML 中提取值
 * @param xml XML 文本
 * @param tag 标签名
 * @returns 标签值
 */
function extractXMLValue(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

/**
 * 移除 HTML 标签
 * @param html HTML 文本
 * @returns 纯文本
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '') // 移除 HTML 标签
    .replace(/&nbsp;/g, ' ') // 替换 HTML 空格
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * 从网页抓取新闻（备选方案）
 * 注：这是一个基础实现，实际使用可能需要更复杂的解析逻辑
 *
 * @param pageUrl 网页 URL
 * @param mediaName 媒体名称
 * @param mediaHandle 媒体 handle
 * @returns 新闻项目数组
 */
export async function fetchFromWebPage(
  pageUrl: string,
  mediaName: string,
  mediaHandle: string
): Promise<NewsItem[]> {
  try {
    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; uAI-NewsBot/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // 注：实际使用需要使用 cheerio 或 jsdom 等库来解析 HTML
    // 这里只是一个占位符实现
    console.warn('⚠️  网页抓取功能需要额外的依赖库，建议优先使用 RSS 源');

    return [];
  } catch (error) {
    console.error(`❌ 从网页 ${pageUrl} 抓取失败:`, error);
    return [];
  }
}

/**
 * 根据媒体源配置抓取新闻
 * @param source 媒体源配置
 * @returns 新闻项目数组
 */
export async function fetchMediaNews(source: {
  name: string;
  handle: string;
  url: string;
  fetchConfig?: {
    method: 'rss' | 'scraper';
  };
}): Promise<NewsItem[]> {
  const method = source.fetchConfig?.method || 'rss';

  if (method === 'rss') {
    return fetchFromRSS(source.url, source.name, source.handle);
  } else if (method === 'scraper') {
    return fetchFromWebPage(source.url, source.name, source.handle);
  } else {
    console.warn(`⚠️  未知的抓取方法: ${method}`);
    return [];
  }
}
