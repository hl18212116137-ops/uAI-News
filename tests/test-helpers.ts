import type { LongformArticle, NewsItem, NewsSource } from "@/lib/types";

export const testSource: NewsSource = {
  platform: "X",
  name: "Test Source",
  handle: "test",
  url: "https://example.com/test",
};

export function makeNewsItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: overrides.id ?? "post-1",
    title: overrides.title ?? "Test post",
    summary: overrides.summary ?? "Short summary",
    content: overrides.content ?? "Post content",
    source: overrides.source ?? testSource,
    category: overrides.category ?? ("行业" as NewsItem["category"]),
    publishedAt: overrides.publishedAt ?? "2026-01-02T10:00:00.000Z",
    originalText: overrides.originalText ?? "Original text",
    createdAt: overrides.createdAt ?? "2026-01-02T10:05:00.000Z",
    ...overrides,
  };
}

export function makeLongformArticle(
  overrides: Partial<LongformArticle> = {}
): LongformArticle {
  return {
    url: overrides.url ?? "https://example.com/article",
    resolvedUrl: overrides.resolvedUrl ?? overrides.url ?? "https://example.com/article",
    title: overrides.title ?? "Longform article",
    sourceName: overrides.sourceName ?? "Example",
    excerpt: overrides.excerpt ?? "Article excerpt",
    translatedTitle: overrides.translatedTitle ?? "Translated title",
    translatedContent: overrides.translatedContent ?? "Translated content",
    originalWordCount: overrides.originalWordCount ?? 1200,
    fetchedAt: overrides.fetchedAt ?? "2026-01-02T11:00:00.000Z",
    ...overrides,
  };
}
