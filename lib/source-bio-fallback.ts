import { formatTypography } from "@/lib/utils";
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
const GENERIC_FALLBACK = "AI Research · Industry";

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

  return GENERIC_FALLBACK;
}

/** @deprecated 请使用 resolveSourceDescription */
export function defaultBioForSourceNotInDb(handle: string): string {
  return resolveSourceDescription(null, handle);
}

/** 优先使用数据库简介，否则走 handle 兜底 */
export function sourceBioDisplayLine(description: string | undefined | null, handle: string): string {
  const line = resolveSourceDescription(description, handle);
  return formatTypography(line);
}

const MAX_SOURCE_BIO_TAGS = 3;

/** 按常见分隔符拆成标签；无分隔符则整段算一条 */
function splitBioIntoTags(formattedLine: string): string[] {
  const t = formattedLine.trim();
  if (!t) return [];
  if (t.includes("、"))
    return t
      .split("、")
      .map((s) => s.trim())
      .filter(Boolean);
  if (/·/.test(t))
    return t
      .split(/\s*·\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  if (/•/.test(t))
    return t
      .split(/\s*•\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  if (/\|/.test(t))
    return t
      .split(/\s*\|\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  if (/,/.test(t))
    return t
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  return [t];
}

/**
 * SOURCES 作者简介：最多 `maxTags` 条，用 ` · ` 连接（与稿面一致），供单行展示
 */
export function sourceBioTagsLine(
  description: string | undefined | null,
  handle: string,
  maxTags: number = MAX_SOURCE_BIO_TAGS,
): string {
  const line = sourceBioDisplayLine(description, handle);
  const tags = splitBioIntoTags(line);
  if (tags.length === 0) return resolveSourceDescription(null, handle);
  return tags.slice(0, maxTags).join(" · ");
}
