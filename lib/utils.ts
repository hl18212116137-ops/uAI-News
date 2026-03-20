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
