/** 粗略判断字符串是否主要为中文（用于展示语言回退） */
export function isMostlyChinese(s: string, threshold = 0.3): boolean {
  const t = s.replace(/\s/g, "");
  if (!t) return false;
  const cjk = (t.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g) ?? []).length;
  return cjk / t.length >= threshold;
}

/**
 * INSIGHT 要点/启发补译：仅对「明显非中文」调用 translateContent。
 * translate API 提示词按「英译中」编写，误把中文句送去翻译会乱码或语义漂移。
 * 含少量英文专名但已有足够汉字时不再翻译。
 */
export function needsTranslateToChineseForInsight(s: string, minCjkToSkip = 4): boolean {
  const t = s.trim();
  if (!t) return false;
  if (isMostlyChinese(s)) return false;
  const compact = t.replace(/\s/g, "");
  const cjk = (compact.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g) ?? []).length;
  if (cjk >= minCjkToSkip) return false;
  return true;
}
