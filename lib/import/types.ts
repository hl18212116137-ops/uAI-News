import type { XReferencedPost } from '@/lib/types';
import type { XArticle } from '@/lib/x';

export type PlatformType = 'X' | 'YouTube' | 'Reddit' | 'Blog' | 'WebPage' | 'Unknown';

export interface NormalizedUrl {
  original: string;
  normalized: string;
  platform: PlatformType;
  isValid: boolean;
  error?: string;
}

export interface ParsedContent {
  externalId: string;
  title?: string;
  content: string;
  author: {
    name: string;
    handle?: string;
    url?: string;
  };
  publishedAt: string;
  url: string;
  platform: PlatformType;
  rawData?: any;
  urls?: string[];
  mediaUrls?: string[];
  referencedPost?: XReferencedPost;
  xArticle?: XArticle;
}

export interface ImportResult {
  success: boolean;
  message: string;
  postId?: string;
  isDuplicate?: boolean;
  error?: string;
  queued?: boolean;
  rawPostId?: string;
}
