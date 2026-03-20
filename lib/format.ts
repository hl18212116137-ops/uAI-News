/**
 * 格式化工具函数
 */

/**
 * 格式化时间为本地化字符串
 * @param dateString ISO 8601 格式的时间字符串
 * @returns 格式化后的时间字符串
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString("zh-CN");
}
