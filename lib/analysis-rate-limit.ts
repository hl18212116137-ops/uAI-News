import "server-only";

const WINDOW_MS = 60_000;
/** 每 IP 每窗口内允许的「现算 INSIGHT」次数（仅 insight_json 未命中时计数） */
const MAX_REQUESTS_PER_WINDOW = 72;
/** 代理未传 IP 时全体共用一个 key；阈值过低会导致本地/部分部署「总是 429」 */
const MAX_REQUESTS_UNKNOWN_IP_PER_WINDOW = 400;
const BUCKET_MAX = 5000;

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

function pruneIfNeeded() {
  if (buckets.size <= BUCKET_MAX) return;
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (now - b.windowStart >= WINDOW_MS * 2) buckets.delete(k);
  }
}

export function getClientRateLimitKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";
  return `insight:${ip}`;
}

export function consumeAnalysisRateLimit(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
  pruneIfNeeded();
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }
  const cap = key.endsWith(":unknown")
    ? MAX_REQUESTS_UNKNOWN_IP_PER_WINDOW
    : MAX_REQUESTS_PER_WINDOW;
  if (b.count < cap) {
    b.count += 1;
    return { ok: true };
  }
  const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (now - b.windowStart)) / 1000));
  return { ok: false, retryAfterSec };
}
