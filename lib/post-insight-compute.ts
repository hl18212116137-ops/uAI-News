import "server-only";

import { createHash } from "crypto";
import { getPostById } from "@/lib/db";
import { getDefaultAIService } from "@/lib/ai/ai-factory";
import { isMostlyChinese, needsTranslateToChineseForInsight } from "@/lib/text-locale";
import { DEFAULT_INSIGHT_PERSONA } from "@/lib/insight-defaults";
import {
  filterInsightReviewEcho,
  sanitizeInsightContextEcho,
} from "@/lib/insight-echo-guard";
import type { InsightAnalysisPayload } from "@/lib/types";

export type { InsightAnalysisPayload } from "@/lib/types";

type TranslateSvc = { translateContent: (s: string) => Promise<string> };

async function ensureChineseInsightReview(
  ai: TranslateSvc,
  review: string[] | null,
): Promise<string[] | null> {
  if (!review?.length) return review;
  const mapped = await Promise.all(
    review.map(async (line) => {
      const t = String(line).trim();
      if (!t) return line;
      if (!needsTranslateToChineseForInsight(t)) return line;
      try {
        const zh = await ai.translateContent(t);
        return zh?.trim() ? zh.trim() : line;
      } catch {
        return line;
      }
    }),
  );
  return mapped;
}

async function ensureChineseInsightContext(
  ai: TranslateSvc,
  contextMatch: string | null,
): Promise<string | null> {
  if (contextMatch == null || !String(contextMatch).trim()) return contextMatch;
  if (!needsTranslateToChineseForInsight(contextMatch)) return contextMatch;
  try {
    const zh = await ai.translateContent(contextMatch);
    return zh?.trim() ? zh.trim() : contextMatch;
  } catch {
    return contextMatch;
  }
}

/**
 * 单次 INSIGHT 计算（供 Route Handler + unstable_cache 调用）。
 * 缓存键由调用方用 postId + userScope + sourcesSig 区分。
 */
export async function computeInsightAnalysis(args: {
  postId: string;
  subscribedSourcesLines: string;
}): Promise<InsightAnalysisPayload | null> {
  const post = await getPostById(args.postId);
  if (!post) return null;

  const aiService = getDefaultAIService();

  const analyzed = await aiService.analyzePost(
    post.originalText,
    post.source.name,
    post.source.handle,
    {
      persona: DEFAULT_INSIGHT_PERSONA,
      subscribedSourcesLines: args.subscribedSourcesLines,
    },
    post.referencedPost ?? null
  );

  const scores =
    typeof post.importanceScore === "number"
      ? post.importanceScore
      : typeof analyzed.importanceScore === "number"
        ? analyzed.importanceScore
        : null;

  const reliability = typeof analyzed.noveltyScore === "number" ? analyzed.noveltyScore : null;

  let contextMatch: string | null =
    analyzed.relevance && analyzed.relevance.trim() !== ""
      ? analyzed.relevance.trim()
      : analyzed.canonicalSummary?.trim()
        ? analyzed.canonicalSummary.trim()
        : null;

  let review =
    analyzed.highlights && analyzed.highlights.length > 0
      ? analyzed.highlights
      : analyzed.canonicalSummary?.trim()
        ? [analyzed.canonicalSummary.trim()]
        : null;

  review = filterInsightReviewEcho(post, review);
  contextMatch = sanitizeInsightContextEcho(post, contextMatch);

  let originalTranslation: string | null =
    typeof analyzed.translatedText === "string" && analyzed.translatedText.trim() !== ""
      ? analyzed.translatedText.trim()
      : null;
  if (!originalTranslation && isMostlyChinese(post.originalText)) {
    originalTranslation = post.originalText.trim();
  }

  let originalTranslationReferenced: string | null =
    typeof analyzed.translatedTextReferenced === "string" &&
    analyzed.translatedTextReferenced.trim() !== ""
      ? analyzed.translatedTextReferenced.trim()
      : null;

  const refText = post.referencedPost?.text?.trim() ?? "";
  if (!originalTranslationReferenced && refText) {
    try {
      const t = await aiService.translateContent(refText);
      if (t?.trim()) originalTranslationReferenced = t.trim();
    } catch {
      /* 降级见下 */
    }
  }
  if (!originalTranslationReferenced && refText && isMostlyChinese(refText)) {
    originalTranslationReferenced = refText;
  }

  const sameSummaryForBoth =
    review != null &&
    review.length === 1 &&
    contextMatch != null &&
    review[0] === contextMatch;

  const reviewZh = await ensureChineseInsightReview(aiService, review);

  const contextZh = sameSummaryForBoth
    ? reviewZh?.[0] ?? contextMatch
    : await ensureChineseInsightContext(aiService, contextMatch);

  return {
    scores,
    reliability,
    review: reviewZh,
    contextMatch: contextZh,
    originalTranslation,
    originalTranslationReferenced,
  };
}

export function insightSourcesSignature(subscribedSourcesLines: string): string {
  return createHash("sha256").update(subscribedSourcesLines).digest("hex").slice(0, 32);
}
