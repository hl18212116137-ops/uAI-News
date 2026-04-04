import { NextResponse } from "next/server";
import { getPersistedInsightForRead, normalizeNewsItemId } from "@/lib/db/news";
import type { InsightAnalysisPayload } from "@/lib/types";

const MAX_IDS = 48;

/**
 * 仅读库中已写入的 INSIGHT（insight_json），不调用 AI、不占 /api/analysis 限流。
 * 供首页批量预热缓存；未入库的帖子仍由用户打开侧栏时 POST /api/analysis 现算。
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const raw = body.postIds;
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ success: false, error: "Missing postIds" }, { status: 400 });
    }

    const ids = raw.slice(0, MAX_IDS).map((x: unknown) => String(x)).filter(Boolean);
    const analyses: Record<string, InsightAnalysisPayload> = {};

    await Promise.all(
      ids.map(async (id) => {
        const normalized = normalizeNewsItemId(id);
        const payload = await getPersistedInsightForRead(normalized);
        if (payload) analyses[id] = payload;
      }),
    );

    return NextResponse.json({ success: true, analyses });
  } catch {
    return NextResponse.json({ success: false, error: "Prefetch failed" }, { status: 500 });
  }
}
