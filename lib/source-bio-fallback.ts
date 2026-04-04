import { formatTypography } from "@/lib/utils";

/**
 * SOURCES 侧栏作者简介：DB 无简介时的展示兜底（与 Figma 第三行文案风格一致）
 * 可被 Client / Server 同时引用（勿放 server-only 模块内）
 */
const BY_HANDLE: Record<string, string> = {
  karpathy: "LLM Research · AI Engineering",
  sama: "LLM Research · AI Engineering",
  ylecun: "LLM Research · AI Engineering",
  huggingface: "Open-source ML · models & datasets",
  ilyasut: "LLM Research · AI Engineering",
};

/** 与稿面一致的通用占位，保证第三行始终有可读简介 */
const GENERIC_FALLBACK = "AI Research · Industry";

export function defaultBioForSourceNotInDb(handle: string): string {
  const k = String(handle).toLowerCase().trim();
  return BY_HANDLE[k] ?? GENERIC_FALLBACK;
}

/** 优先使用数据库简介，否则走 handle 兜底 */
export function sourceBioDisplayLine(description: string | undefined | null, handle: string): string {
  const d = description?.trim();
  const line = d ? d : defaultBioForSourceNotInDb(handle);
  return formatTypography(line);
}
