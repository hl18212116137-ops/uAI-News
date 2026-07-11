import type { NewsItem } from "@/lib/types";

export const HOME_FEED_PAGE_SIZE = 12;
export const LONGFORM_FEED_PAGE_SIZE = 12;
export const HOME_RECOMMENDED_PREFETCH_LIMIT = 48;
const FEED_CONTENT_PREVIEW_CHARS = 420;
const FEED_ORIGINAL_PREVIEW_CHARS = 220;
const FEED_REFERENCED_PREVIEW_CHARS = 420;

export type FeedPage = {
  posts: NewsItem[];
  total: number;
  nextOffset: number;
  hasMore: boolean;
};

export type FeedPageFilters = {
  sourceHandle?: string;
  category?: string;
  searchQuery?: string;
};

export function stripLongformPosts(posts: NewsItem[]) {
  return posts.filter((post) => !post.longform?.translatedContent);
}

export function clampFeedPageLimit(value: unknown, fallback = HOME_FEED_PAGE_SIZE) {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), 40);
}

export function clampFeedPageOffset(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.trunc(parsed), 0);
}

function trimPreviewText(value: string, maxChars: number): string {
  const text = String(value ?? "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function toFeedListItem(post: NewsItem): NewsItem {
  const referencedPost = post.referencedPost
    ? {
        ...post.referencedPost,
        text: trimPreviewText(post.referencedPost.text, FEED_REFERENCED_PREVIEW_CHARS),
      }
    : undefined;

  return {
    ...post,
    content: trimPreviewText(post.content, FEED_CONTENT_PREVIEW_CHARS),
    originalText: trimPreviewText(post.originalText, FEED_ORIGINAL_PREVIEW_CHARS),
    ...(referencedPost ? { referencedPost } : {}),
  };
}

function normalizeHandleForFilter(handle: unknown): string {
  return String(handle ?? "").trim().replace(/^@+/, "").toLowerCase();
}

function textMatchesQuery(value: unknown, lowerQuery: string): boolean {
  return String(value ?? "").toLowerCase().includes(lowerQuery);
}

export function filterFeedPosts(posts: NewsItem[], filters?: FeedPageFilters): NewsItem[] {
  const sourceHandle = normalizeHandleForFilter(filters?.sourceHandle);
  const category = String(filters?.category ?? "").trim();
  const lowerQuery = String(filters?.searchQuery ?? "").trim().toLowerCase();

  if (!sourceHandle && (!category || category === "all") && !lowerQuery) return posts;

  return posts.filter((post) => {
    if (category && category !== "all" && post.category !== category) return false;

    if (sourceHandle) {
      const handle = typeof post.source === "string" ? post.source : post.source?.handle;
      if (normalizeHandleForFilter(handle) !== sourceHandle) return false;
    }

    if (lowerQuery) {
      const source = typeof post.source === "string" ? post.source : post.source;
      const matches = [
        post.title,
        post.summary,
        post.content,
        post.originalText,
        post.referencedPost?.text,
        typeof source === "string" ? source : source?.name,
        typeof source === "string" ? source : source?.handle,
        post.longform?.title,
        post.longform?.translatedTitle,
        post.longform?.translatedContent,
      ].some((value) => textMatchesQuery(value, lowerQuery));
      if (!matches) return false;
    }

    return true;
  });
}

export function makeFeedPage(posts: NewsItem[], offset: number, limit: number): FeedPage {
  const start = clampFeedPageOffset(offset);
  const pageSize = clampFeedPageLimit(limit);
  const pagePosts = posts.slice(start, start + pageSize);
  const nextOffset = start + pagePosts.length;

  return {
    posts: pagePosts.map(toFeedListItem),
    total: posts.length,
    nextOffset,
    hasMore: nextOffset < posts.length,
  };
}

export function makeFilteredFeedPage(
  posts: NewsItem[],
  offset: number,
  limit: number,
  filters?: FeedPageFilters
): FeedPage {
  return makeFeedPage(filterFeedPosts(posts, filters), offset, limit);
}
