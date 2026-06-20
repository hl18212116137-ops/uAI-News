import { BaseParser } from './base-parser';
import { ParsedContent } from '../types';
import {
  fetchTweetById,
  fetchXArticleByTweetId,
  hasXArticleEntity,
  type XArticle,
} from '@/lib/x';

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
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const username = pathParts[0] || 'unknown';

    const tweetData = await fetchTweetById(externalId, username);
    const article = await this.fetchArticleIfPresent(
      externalId,
      tweetData.raw,
      tweetData.post_url || url,
    );
    const handle = (article?.authorHandle || tweetData.handle || username).replace(/^@/, '');
    const mediaUrls = [
      ...(tweetData.media_urls ?? []),
      ...(article?.mediaUrls ?? []),
    ].filter((value, index, all) => value && all.indexOf(value) === index);

    return {
      externalId,
      ...(article?.title ? { title: article.title } : {}),
      content: article?.text ? `${article.title}\n\n${article.text}` : tweetData.post_text,
      author: {
        name: article?.authorName || tweetData.author_name || handle,
        handle: `@${handle}`,
        url: `https://x.com/${handle}`,
      },
      publishedAt: article?.createdAt || tweetData.posted_at,
      url: tweetData.post_url || url,
      platform: 'X',
      rawData: { tweet: tweetData, ...(article ? { article } : {}) },
      ...(mediaUrls.length > 0 ? { mediaUrls } : {}),
      ...(tweetData.referencedPost ? { referencedPost: tweetData.referencedPost } : {}),
      ...(article ? { xArticle: article } : {}),
    };
  }

  private async fetchArticleIfPresent(
    tweetId: string,
    rawTweet?: Record<string, unknown>,
    fallbackUrl?: string,
  ): Promise<XArticle | undefined> {
    if (!rawTweet || !hasXArticleEntity(rawTweet)) return undefined;

    return fetchXArticleByTweetId(tweetId, fallbackUrl).catch((error) => {
      console.warn(`Error fetching X article ${tweetId}:`, error);
      return undefined;
    });
  }
}
