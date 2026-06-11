import type { NewsItem } from "@/lib/types";

const X_STATUS_PATH_RE = /(?:x\.com|twitter\.com)\/([^/?#]+)\/status\/(\d+)/i;
const X_STATUS_LOOSE_RE = /(?:x\.com|twitter\.com)\/([^/?#]+)\/status\/([^/?#]+)/i;

/** 本地种子 / 演示帖（无真实 X status ID） */
export function isPlaceholderNewsPostId(postId: string): boolean {
  const id = String(postId ?? "").trim();
  return id.startsWith("seed-") || id.startsWith("uai-demo-");
}

export function isValidXStatusId(statusId: string): boolean {
  return /^\d{5,}$/.test(String(statusId ?? "").trim());
}

/** 从 news_items.id 提取 X 推文 snowflake（如 x-123… 或纯数字） */
export function extractXStatusIdFromPostId(postId: string): string | null {
  const id = String(postId ?? "").trim();
  if (!id) return null;
  const prefixed = id.match(/^x[-_](\d{5,})$/i);
  if (prefixed) return prefixed[1];
  if (/^\d{5,}$/.test(id)) return id;
  return null;
}

export function parseXStatusUrl(url: string): { handle: string; statusId: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const m = trimmed.match(X_STATUS_PATH_RE);
  if (!m) return null;
  return { handle: m[1], statusId: m[2] };
}

function normalizeXStatusUrl(handle: string, statusId: string): string {
  const h = handle.replace(/^@/, "").trim();
  return `https://x.com/${h}/status/${statusId}`;
}

/**
 * 解析可点击的原文链接：优先 /status/{数字}；X 帖可从 id + handle 反推。
 */
export function resolveNewsPostUrl(post: Pick<NewsItem, "id" | "source">): string {
  const url = post.source?.url?.trim() ?? "";
  const handle = post.source?.handle?.replace(/^@/, "").trim() ?? "";
  const platform = post.source?.platform;
  const isX = platform === "X" || platform?.toLowerCase() === "x";

  const parsed = parseXStatusUrl(url);
  if (parsed) {
    return normalizeXStatusUrl(parsed.handle, parsed.statusId);
  }

  if (isX && handle) {
    const statusId = extractXStatusIdFromPostId(post.id);
    if (statusId) {
      return normalizeXStatusUrl(handle, statusId);
    }
  }

  if (isX && url) {
    const loose = url.match(X_STATUS_LOOSE_RE);
    if (loose && !isValidXStatusId(loose[2])) {
      return "";
    }
  }

  if (isPlaceholderNewsPostId(post.id)) {
    return "";
  }

  if (isX && url && !parseXStatusUrl(url)) {
    return "";
  }

  return url;
}

/** 入库 / 映射行数据时统一 X 推文 URL */
export function canonicalizeNewsSourceUrl(post: Pick<NewsItem, "id" | "source">): string {
  return resolveNewsPostUrl(post);
}
