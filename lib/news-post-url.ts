import type { NewsItem } from "@/lib/types";

const X_STATUS_PATH_RE = /(?:x\.com|twitter\.com)\/([^/?#]+)\/status\/(\d+)/i;
const X_STATUS_LOOSE_RE = /(?:x\.com|twitter\.com)\/([^/?#]+)\/status\/([^/?#]+)/i;
const X_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);
const TRACKING_QUERY_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "source",
  "spm",
]);

function shouldDropQueryParam(name: string): boolean {
  const key = name.toLowerCase();
  return key.startsWith("utm_") || TRACKING_QUERY_PARAMS.has(key);
}

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
  const h = handle.replace(/^@/, "").trim().toLowerCase();
  return `https://x.com/${h}/status/${statusId}`;
}

function parseXStatusUrlObject(url: URL): { handle: string; statusId: string } | null {
  if (!X_HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const statusIndex = parts.findIndex((part) => part.toLowerCase() === "status");
  if (statusIndex <= 0) return null;
  const handle = parts[statusIndex - 1];
  const statusId = parts[statusIndex + 1];
  if (!handle || !statusId || !isValidXStatusId(statusId)) return null;
  return { handle, statusId };
}

/**
 * Canonical URL used by ingest/import/storage dedupe.
 * X/Twitter status links collapse to x.com/{lower-handle}/status/{id}; other URLs
 * keep meaningful query params but drop common trackers and fragments.
 */
export function canonicalizeExternalUrlForDedupe(rawUrl: string): string {
  const trimmed = String(rawUrl ?? "").trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const xStatus = parseXStatusUrlObject(url);
    if (xStatus) {
      return normalizeXStatusUrl(xStatus.handle, xStatus.statusId);
    }

    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";

    for (const key of Array.from(url.searchParams.keys())) {
      if (shouldDropQueryParam(key)) {
        url.searchParams.delete(key);
      }
    }

    const query = Array.from(url.searchParams.entries()).sort(([aKey, aValue], [bKey, bValue]) => {
      const byKey = aKey.localeCompare(bKey);
      return byKey !== 0 ? byKey : aValue.localeCompare(bValue);
    });
    url.search = "";
    for (const [key, value] of query) {
      url.searchParams.append(key, value);
    }

    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    }

    return url.toString();
  } catch {
    return trimmed;
  }
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
  return canonicalizeExternalUrlForDedupe(resolveNewsPostUrl(post));
}
