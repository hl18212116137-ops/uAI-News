/** 粗略判断字符串是否主要为中文（用于展示语言回退） */
export function isMostlyChinese(s: string, threshold = 0.3): boolean {
  const t = s.replace(/\s/g, "");
  if (!t) return false;
  const cjk = (t.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g) ?? []).length;
  return cjk / t.length >= threshold;
}
