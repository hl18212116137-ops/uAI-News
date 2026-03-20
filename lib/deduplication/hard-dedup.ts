import crypto from 'crypto';

/**
 * 硬去重模块
 * 使用纯规则进行去重，无需 AI 调用
 *
 * 去重维度：
 * 1. tweet_id - 推文 ID
 * 2. source_url - 推文 URL
 * 3. cleaned_text_hash - 清洗后文本的哈希值
 */

/**
 * 原始推文类型
 */
export interface RawPost {
  id?: string;
  platform?: string;
  handle?: string;
  authorName?: string;
  text?: string;
  url?: string;
  publishedAt?: string;
  fetchedAt?: string;
}

/**
 * 清洗文本
 * 去除 HTML 实体、多余空格、URL 参数等
 */
function cleanText(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 生成内容哈希
 */
function generateContentHash(text: string): string {
  return crypto
    .createHash('sha256')
    .update(text.trim().toLowerCase())
    .digest('hex');
}

/**
 * 硬去重主函数
 *
 * @param items 原始推文列表
 * @returns 去重后的推文列表
 */
export function hardDeduplicate(items: RawPost[]): RawPost[] {
  const seen = new Set<string>();
  const deduplicated: RawPost[] = [];

  let duplicateCount = 0;

  for (const item of items) {
    let isDuplicate = false;

    // 检查 tweet_id
    if (item.id) {
      const idKey = `id:${item.id}`;
      if (seen.has(idKey)) {
        isDuplicate = true;
        duplicateCount++;
        console.log(`[HardDedup] Duplicate ID: ${item.id}`);
      } else {
        seen.add(idKey);
      }
    }

    // 检查 source_url
    if (!isDuplicate && item.url) {
      const urlKey = `url:${item.url}`;
      if (seen.has(urlKey)) {
        isDuplicate = true;
        duplicateCount++;
        console.log(`[HardDedup] Duplicate URL: ${item.url}`);
      } else {
        seen.add(urlKey);
      }
    }

    // 检查 cleaned_text_hash
    if (!isDuplicate && item.text) {
      const cleaned = cleanText(item.text);
      const hash = generateContentHash(cleaned);
      const hashKey = `hash:${hash}`;

      if (seen.has(hashKey)) {
        isDuplicate = true;
        duplicateCount++;
        console.log(`[HardDedup] Duplicate content hash for: ${item.id || 'unknown'}`);
      } else {
        seen.add(hashKey);
      }
    }

    if (!isDuplicate) {
      deduplicated.push(item);
    }
  }

  console.log(`[HardDedup] Removed ${duplicateCount} duplicates, kept ${deduplicated.length} items`);

  return deduplicated;
}
