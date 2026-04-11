import type { InsightAnalysisPayload, NewsItem } from "@/lib/types";
import { isMostlyChinese } from "@/lib/text-locale";

/** 仅需 originalText / referencedPost 做「是否原文回显」判断 */
export type InsightEchoPostSlice = Pick<NewsItem, "originalText" | "referencedPost">;

/** 去掉列表符号、引号后再识别 RT @ */
function normalizeLeadForRtCheck(v: string): string {
  return v
    .trim()
    .replace(/^[`"'「『""''\s]+/, "")
    .replace(/^[\s*•\-\u2013\u2014]+/u, "")
    .trim();
}

/**
 * 判断 INSIGHT 字段是否像未加工的推文正文（误把原文当「要点/启发」展示）。
 * 注意：库内 originalText 可能已译为中文，与英文 RT 无法做前缀比对，须单独识别 `RT @handle` 句式。
 *
 * 中文场景下要点常与原文开头有少量重合（同一话题），原先 12 字前缀即判 echo 会误杀整段要点/启发。
 */
export function insightLineLooksLikeRawPostEcho(sourceTexts: string[], value: string): boolean {
  const v = value.trim();
  if (v.length < 8) return false;

  const core = normalizeLeadForRtCheck(v.replace(/^-\s+/, "").trim());
  if (/^RT\s+@/i.test(core)) return true;

  const zhEcho =
    isMostlyChinese(v) || sourceTexts.some((t) => t && isMostlyChinese(t));
  /** 与原文首段需重合的最小长度：中文放宽，减少误杀 */
  const minPrefixLen = zhEcho ? 28 : 16;
  const minOverlap = zhEcho ? 36 : 18;
  const overlapCap = zhEcho ? 56 : 40;

  for (const raw of sourceTexts) {
    const o = raw.trim();
    if (!o) continue;
    if (o.startsWith(v) && v.length >= minPrefixLen) return true;
    if (v.startsWith(o) && o.length >= minPrefixLen) return true;
    const n = Math.min(overlapCap, o.length, v.length);
    if (n >= minOverlap && o.slice(0, n) === v.slice(0, n)) return true;
  }
  return false;
}

export function insightSourceTextsForEcho(post: InsightEchoPostSlice): string[] {
  const out: string[] = [];
  if (post.originalText?.trim()) out.push(post.originalText);
  if (post.referencedPost?.text?.trim()) out.push(post.referencedPost.text);
  return out;
}

export function filterInsightReviewEcho(
  post: InsightEchoPostSlice,
  review: string[] | null,
): string[] | null {
  if (!review?.length) return review;
  const sources = insightSourceTextsForEcho(post);
  const next = review.filter((line) => !insightLineLooksLikeRawPostEcho(sources, line));
  return next.length > 0 ? next : null;
}

export function sanitizeInsightContextEcho(
  post: InsightEchoPostSlice,
  contextMatch: string | null,
): string | null {
  if (contextMatch == null || !contextMatch.trim()) return contextMatch;
  const sources = insightSourceTextsForEcho(post);
  if (insightLineLooksLikeRawPostEcho(sources, contextMatch)) return null;
  return contextMatch;
}

/** 读库 / 前端展示前统一去掉误写入的「假要点/假启发」 */
/**
 * 缓存是否仍含有「未经过滤的」要点/启发原文。
 * 用于 MainContent：预取若完全未给 review/context，仍应走 POST 拉完整分析，否则会一直停在「暂无」且 isLoading 为 false。
 */
export function hasRawInsightPayload(payload: {
  review?: unknown;
  contextMatch?: unknown;
} | null | undefined): boolean {
  if (!payload) return false;
  const review = payload.review;
  if (Array.isArray(review)) {
    if (review.some((x) => String(x).trim().length > 0)) return true;
  } else if (typeof review === "string" && review.trim().length > 0) {
    return true;
  }
  const ctx = payload.contextMatch;
  return typeof ctx === "string" && ctx.trim().length > 0;
}

export function sanitizeInsightPayloadForPost(
  post: InsightEchoPostSlice,
  payload: InsightAnalysisPayload,
): InsightAnalysisPayload {
  const review = Array.isArray(payload.review) ? payload.review : null;
  const nextReview = filterInsightReviewEcho(post, review);
  const nextContext = sanitizeInsightContextEcho(post, payload.contextMatch);
  return {
    ...payload,
    review: nextReview,
    contextMatch: nextContext,
  };
}
