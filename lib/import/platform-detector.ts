import { PlatformType } from './types';

/**
 * 平台检测器
 * 负责识别 URL 所属的平台并提取关键信息
 */

export interface PlatformInfo {
  platform: PlatformType;
  isSupported: boolean;
  externalId?: string;  // 从 URL 中提取的外部 ID
  error?: string;
}

/**
 * 检测平台并提取信息
 * @param normalizedUrl 规范化后的 URL
 * @returns PlatformInfo 平台信息
 */
export function detectPlatform(normalizedUrl: string): PlatformInfo {
  try {
    const url = new URL(normalizedUrl);
    const hostname = url.hostname.toLowerCase();

    // X / Twitter
    if (hostname === 'x.com' || hostname === 'www.x.com' ||
        hostname === 'twitter.com' || hostname === 'www.twitter.com') {
      return detectXPlatform(url);
    }

    // YouTube
    if (hostname === 'youtube.com' || hostname === 'www.youtube.com' ||
        hostname === 'youtu.be' || hostname === 'm.youtube.com') {
      return {
        platform: 'YouTube',
        isSupported: false,
        error: 'YouTube 平台暂不支持，敬请期待',
      };
    }

    // Reddit
    if (hostname === 'reddit.com' || hostname === 'www.reddit.com' ||
        hostname === 'old.reddit.com') {
      return {
        platform: 'Reddit',
        isSupported: false,
        error: 'Reddit 平台暂不支持，敬请期待',
      };
    }

    // 未知平台
    return {
      platform: 'Unknown',
      isSupported: false,
      error: '不支持的平台',
    };
  } catch (error) {
    return {
      platform: 'Unknown',
      isSupported: false,
      error: '无效的 URL',
    };
  }
}

/**
 * 检测 X / Twitter 平台信息
 * @param url URL 对象
 * @returns PlatformInfo
 */
function detectXPlatform(url: URL): PlatformInfo {
  // X / Twitter 单条推文的 URL 格式：
  // https://x.com/username/status/1234567890
  // https://twitter.com/username/status/1234567890

  const pathParts = url.pathname.split('/').filter(p => p);

  // 检查路径格式：至少需要 3 个部分 [username, 'status', id]
  if (pathParts.length < 3) {
    return {
      platform: 'X',
      isSupported: false,
      error: '不支持的 X 链接格式，请提供单条推文链接',
    };
  }

  // 检查是否为 status 链接
  if (pathParts[1] !== 'status') {
    return {
      platform: 'X',
      isSupported: false,
      error: '不支持的 X 链接格式，请提供单条推文链接（包含 /status/）',
    };
  }

  // 提取推文 ID
  const tweetId = pathParts[2];

  // 验证推文 ID 是否为数字
  if (!/^\d+$/.test(tweetId)) {
    return {
      platform: 'X',
      isSupported: false,
      error: '无效的推文 ID',
    };
  }

  return {
    platform: 'X',
    isSupported: true,
    externalId: tweetId,
  };
}
