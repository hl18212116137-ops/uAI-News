/**
 * 将秒数格式化为中文时间字符串
 * @param seconds 秒数
 * @returns 格式化后的时间字符串，如 "3 分 20 秒"
 */
export function formatTime(seconds: number): string {
  if (seconds === 0) return '0 秒';
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) return `${minutes} 分`;
  return `${minutes} 分 ${secs} 秒`;
}

/**
 * 判断推文是否为"最新一批"抓取的
 * 只在抓取完成后的首次页面加载时显示"新"标签
 * 刷新页面后标签消失
 * @param createdAt 推文的导入时间
 * @returns boolean 是否为新推文
 */
export function isNewPost(createdAt: string): boolean {
  try {
    // 检查是否在浏览器环境
    if (typeof window === 'undefined') {
      return false;
    }

    // 获取最后一次抓取的时间戳
    const lastFetchTimestamp = sessionStorage.getItem('lastFetchTimestamp');
    const hasRefreshed = sessionStorage.getItem('hasRefreshed');

    if (!lastFetchTimestamp || hasRefreshed === 'true') {
      // 如果没有记录，或者已经刷新过，不显示"新"标签
      return false;
    }

    const lastFetchTime = parseInt(lastFetchTimestamp, 10);
    const postCreatedTime = new Date(createdAt).getTime();

    // 只有在最后一次抓取之后创建的推文才显示"新"标签
    return postCreatedTime >= lastFetchTime;
  } catch (error) {
    return false;
  }
}

/**
 * 自动修正中英文/数字之间的排版空格
 * @param text 原始文本
 * @returns 修正后的文本
 */
export function formatTypography(text: string): string {
  if (!text) return text;
  return text
    .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2');
}

/** 互动数紧凑展示（侧栏等） */
export function formatSocialCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}
