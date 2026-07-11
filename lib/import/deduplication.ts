import { getPostByUrl, getPostById } from '../db';
import { NewsItem } from '../types';
import { canonicalNewsIdForPlatform } from '@/lib/news-dedupe';
import { canonicalizeExternalUrlForDedupe } from '@/lib/news-post-url';

/**
 * 去重检查器
 * 负责检查内容是否已经存在
 */

export interface DuplicationCheckResult {
  isDuplicate: boolean;
  existingPost?: NewsItem;
  reason?: string;
}

/**
 * 检查内容是否重复
 * @param url 规范化后的 URL
 * @param externalId 外部内容 ID
 * @param platform 平台类型
 * @returns Promise<DuplicationCheckResult> 去重检查结果
 */
export async function checkDuplication(
  url: string,
  externalId: string,
  platform: string
): Promise<DuplicationCheckResult> {
  const compositeId = canonicalNewsIdForPlatform(platform, externalId);
  const canonicalUrl = canonicalizeExternalUrlForDedupe(url);

  const [existingByUrl, existingById] = await Promise.all([
    getPostByUrl(canonicalUrl),
    getPostById(compositeId),
  ]);

  if (existingByUrl) {
    return {
      isDuplicate: true,
      existingPost: existingByUrl,
      reason: '该链接已经导入过',
    };
  }

  if (existingById) {
    return {
      isDuplicate: true,
      existingPost: existingById,
      reason: '该内容已经导入过（相同的平台和内容 ID）',
    };
  }

  return {
    isDuplicate: false,
  };
}
