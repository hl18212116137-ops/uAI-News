import { RECOMMENDATION_POOL } from "@/lib/recommendation-pool-data";

/**
 * SOURCES 侧栏作者简介：DB 无简介时的展示兜底（与 Figma 第三行文案风格一致）
 * 可被 Client / Server 同时引用（勿放 server-only 模块内）
 */
const LEGACY_BY_HANDLE: Record<string, string> = {
  karpathy: "LLM Research · AI Engineering",
  sama: "LLM Research · AI Engineering",
  ylecun: "LLM Research · AI Engineering",
  huggingface: "Open-source ML · models & datasets",
  ilyasut: "LLM Research · AI Engineering",
};

/** 推荐池种子简介（handle 小写 → 文案） */
const POOL_BIO_BY_HANDLE: Record<string, string> = Object.fromEntries(
  RECOMMENDATION_POOL.map((row) => [row.handle.toLowerCase(), row.description]),
);

/** 与稿面一致的通用占位，保证第三行始终有可读简介 */
export const GENERIC_SOURCE_DESCRIPTION_FALLBACK = "AI Research · Industry";

function normalizeBioHandle(handle: string): string {
  return String(handle ?? "").trim().replace(/^@+/, "").toLowerCase();
}

/**
 * 解析信息源简介：DB 有值优先 → 推荐池 → 历史兜底 → 通用占位
 * 全站信息源（订阅 / 推荐）展示与入库均应经此函数，保证永不为空
 */
export function resolveSourceDescription(
  description: string | null | undefined,
  handle: string,
): string {
  const trimmed = String(description ?? "").trim();
  if (trimmed) return trimmed;

  const key = normalizeBioHandle(handle);
  if (key && POOL_BIO_BY_HANDLE[key]) return POOL_BIO_BY_HANDLE[key];
  if (key && LEGACY_BY_HANDLE[key]) return LEGACY_BY_HANDLE[key];

  return GENERIC_SOURCE_DESCRIPTION_FALLBACK;
}

export function isGenericSourceDescriptionFallback(description: unknown): boolean {
  return String(description ?? "").trim() === GENERIC_SOURCE_DESCRIPTION_FALLBACK;
}
