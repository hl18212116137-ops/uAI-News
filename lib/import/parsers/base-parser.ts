import { ParsedContent } from '../types';

/**
 * 基础解析器接口
 * 所有平台解析器都需要实现这个接口
 */
export interface BaseParser {
  /**
   * 解析内容
   * @param url 规范化后的 URL
   * @param externalId 外部内容 ID
   * @returns Promise<ParsedContent> 解析后的内容
   */
  parse(url: string, externalId: string): Promise<ParsedContent>;

  /**
   * 验证是否可以解析该 URL
   * @param url URL 字符串
   * @returns boolean 是否可以解析
   */
  canParse(url: string): boolean;
}
