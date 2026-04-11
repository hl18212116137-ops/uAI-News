import "server-only";

import { unstable_cache } from "next/cache";
import {
  getPersistedInsightForRead,
  mergeInsightGlobalPayload,
  normalizeNewsItemId,
} from "@/lib/db/news";
import { computeInsightAnalysis, type InsightAnalysisPayload } from "@/lib/post-insight-compute";
import { consumeAnalysisRateLimit, getClientRateLimitKey } from "@/lib/analysis-rate-limit";

/** INSIGHT 全局一份：按 postId 缓存；与订阅无关 */
const INSIGHT_CACHE_REVALIDATE_SEC = 60 * 60 * 24;

export type PostInsightServiceResult =
  | { kind: "success"; analysis: InsightAnalysisPayload }
  | { kind: "not_found" }
  | { kind: "bad_request"; error: string }
  | { kind: "rate_limited"; error: string; retryAfterSec: number }
  | { kind: "server_error"; error: string };

/** 同一 post 并发 POST 只跑一次限流 + 一次 AI（Strict Mode / 快速重试共用结果） */
const insightComputeCoalesce = new Map<string, Promise<PostInsightServiceResult>>();

async function runInsightComputeOnce(
  normalizedPostId: string,
  request: Request,
): Promise<PostInsightServiceResult> {
  try {
    const fromDb2 = await getPersistedInsightForRead(normalizedPostId);
    if (fromDb2) {
      return { kind: "success", analysis: fromDb2 };
    }

    const limitKey = getClientRateLimitKey(request);
    const limited = consumeAnalysisRateLimit(limitKey);
    if (!limited.ok) {
      return {
        kind: "rate_limited",
        error: "请求过于频繁，请稍后再试",
        retryAfterSec: limited.retryAfterSec,
      };
    }

    const getCached = unstable_cache(
      async () => {
        const computed = await computeInsightAnalysis({
          postId: normalizedPostId,
          subscribedSourcesLines: "",
        });
        if (computed) {
          await mergeInsightGlobalPayload(normalizedPostId, computed);
        }
        return computed;
      },
      ["post-insight-global", normalizedPostId],
      { revalidate: INSIGHT_CACHE_REVALIDATE_SEC },
    );

    const analysis = await getCached();

    if (!analysis) {
      return { kind: "not_found" };
    }

    return { kind: "success", analysis };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Analysis generation failed";
    return { kind: "server_error", error: message };
  }
}

/**
 * POST /api/analysis 主体逻辑（不含 Response 封装）
 */
export async function runPostInsightForRequest(request: Request): Promise<PostInsightServiceResult> {
  try {
    const body = await request.json().catch(() => ({}));
    const postId = body.postId;

    if (!postId || typeof postId !== "string") {
      return { kind: "bad_request", error: "Missing postId" };
    }

    const normalizedPostId = normalizeNewsItemId(postId);

    const fromDb = await getPersistedInsightForRead(normalizedPostId);
    if (fromDb) {
      return { kind: "success", analysis: fromDb };
    }

    let inflight = insightComputeCoalesce.get(normalizedPostId);
    if (!inflight) {
      const inflightPromise = runInsightComputeOnce(normalizedPostId, request).finally(() => {
        if (insightComputeCoalesce.get(normalizedPostId) === inflightPromise) {
          insightComputeCoalesce.delete(normalizedPostId);
        }
      });
      insightComputeCoalesce.set(normalizedPostId, inflightPromise);
      inflight = inflightPromise;
    }

    return await inflight;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Analysis generation failed";
    return { kind: "server_error", error: message };
  }
}
