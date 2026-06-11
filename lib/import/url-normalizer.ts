import { NormalizedUrl, PlatformType } from './types';

/**
 * URL 规范化器
 * 负责清理、验证和规范化输入的 URL
 */

/**
 * 规范化 URL
 * @param rawUrl 原始 URL
 * @returns NormalizedUrl 规范化结果
 */
export function normalizeUrl(rawUrl: string): NormalizedUrl {
  // 去除首尾空格
  const trimmed = rawUrl.trim();

  // 检查是否为空
  if (!trimmed) {
    return {
      original: rawUrl,
      normalized: '',
      platform: 'Unknown',
      isValid: false,
      error: '链接不能为空',
    };
  }

  try {
    // 尝试解析 URL
    const url = new URL(trimmed);

    // 规范化处理
    let normalized = url.href;

    // 移除常见的跟踪参数
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'source'];
    trackingParams.forEach(param => {
      url.searchParams.delete(param);
    });

    // 重新构建 URL（不包含跟踪参数）
    normalized = url.origin + url.pathname + (url.search || '') + (url.hash || '');

    // 识别平台
    const platform = detectPlatform(url);

    // 验证 URL 是否有效
    const isValid = platform !== 'Unknown';

    return {
      original: rawUrl,
      normalized,
      platform,
      isValid,
      error: isValid ? undefined : '不支持的平台或链接格式',
    };
  } catch (error) {
    return {
      original: rawUrl,
      normalized: '',
      platform: 'Unknown',
      isValid: false,
      error: '无效的 URL 格式',
    };
  }
}

/**
 * 检测 URL 所属的平台
 * @param url URL 对象
 * @returns PlatformType 平台类型
 */
function detectPlatform(url: URL): PlatformType {
  const hostname = url.hostname.toLowerCase();

  // X / Twitter
  if (hostname === 'x.com' || hostname === 'www.x.com' ||
      hostname === 'twitter.com' || hostname === 'www.twitter.com') {
    return 'X';
  }

  // YouTube
  if (hostname === 'youtube.com' || hostname === 'www.youtube.com' ||
      hostname === 'youtu.be' || hostname === 'm.youtube.com') {
    return 'YouTube';
  }

  // Reddit
  if (hostname === 'reddit.com' || hostname === 'www.reddit.com' ||
      hostname === 'old.reddit.com') {
    return 'Reddit';
  }

  // 未知平台
  return 'Unknown';
}

/**
 * 统一 X / Twitter URL
 * 将 twitter.com 转换为 x.com
 * @param url URL 字符串
 * @returns 统一后的 URL
 */
export function unifyXUrl(url: string): string {
  return url.replace(/twitter\.com/g, 'x.com');
}
