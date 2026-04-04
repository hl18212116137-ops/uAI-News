import { BaseParser } from './base-parser';
import { ParsedContent } from '../types';
import { extractReferencedPostFromTweet } from '@/lib/x';

/**
 * X / Twitter 解析器
 * 负责从 X / Twitter 抓取推文内容
 * 使用 TwitterAPI.io 服务获取推文数据
 */
export class XParser implements BaseParser {
  canParse(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      return (
        hostname === 'x.com' ||
        hostname === 'www.x.com' ||
        hostname === 'twitter.com' ||
        hostname === 'www.twitter.com'
      );
    } catch {
      return false;
    }
  }

  async parse(url: string, externalId: string): Promise<ParsedContent> {
    // 从 URL 中提取用户名
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    const username = pathParts[0];

    // 使用 TwitterAPI.io 获取推文数据
    const tweetData = await this.fetchTweetFromAPI(externalId, username);

    return {
      externalId,
      content: tweetData.text,
      author: {
        name: tweetData.authorName || username,
        handle: `@${username}`,
        url: `https://x.com/${username}`,
      },
      publishedAt: tweetData.createdAt,
      url,
      platform: 'X',
      rawData: tweetData,
      ...(tweetData.referencedPost ? { referencedPost: tweetData.referencedPost } : {}),
    };
  }

  /**
   * 使用 TwitterAPI.io 获取推文数据
   */
  private async fetchTweetFromAPI(
    tweetId: string,
    username: string
  ): Promise<{
    text: string;
    authorName: string;
    createdAt: string;
    referencedPost?: import('@/lib/types').XReferencedPost;
  }> {
    const apiKey = process.env.TWITTERAPI_IO_KEY;

    if (!apiKey) {
      throw new Error('TWITTERAPI_IO_KEY not configured');
    }

    // TwitterAPI.io 的推文详情接口
    const url = `https://api.twitterapi.io/twitter/tweet?tweetId=${tweetId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`TwitterAPI.io request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // 提取推文数据
      const tweet = data?.data?.tweet;

      if (!tweet) {
        throw new Error('Tweet not found in API response');
      }

      const t = tweet as Record<string, unknown>;
      const referencedPost = extractReferencedPostFromTweet(t);

      return {
        text: tweet.text || '',
        authorName: tweet.user?.name || username,
        createdAt: tweet.createdAt || tweet.created_at || new Date().toISOString(),
        ...(referencedPost ? { referencedPost } : {}),
      };
    } catch (error) {
      console.error(`Error fetching tweet ${tweetId}:`, error);
      throw error;
    }
  }

}
