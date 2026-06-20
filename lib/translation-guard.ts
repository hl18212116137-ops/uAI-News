import type { AIProcessedContent, AIService } from "@/lib/ai/ai-service";
import { cleanNewsTitle } from "@/lib/news-title-cleanup";
import { isMostlyChinese } from "@/lib/text-locale";

export async function ensureChineseTitleSummary(
  ai: AIService,
  draft: AIProcessedContent
): Promise<AIProcessedContent> {
  let { title, summary, ...rest } = draft;

  if (title.trim() && !isMostlyChinese(title, 0.2)) {
    try {
      title = (
        await ai.translateContent(
          `将下面这句新闻标题译为简短简体中文标题（不要引号或“标题：”前缀）：\n${title}`
        )
      ).trim();
    } catch {
      /* Keep the original title if the guard translation fails. */
    }
  }

  if (summary.trim() && !isMostlyChinese(summary, 0.12)) {
    try {
      summary = (
        await ai.translateContent(`将下面这段文字译为简体中文资讯摘要（一段话）：\n${summary}`)
      ).trim();
    } catch {
      /* Keep the original summary if the guard translation fails. */
    }
  }

  return { ...rest, title: cleanNewsTitle(title), summary };
}

export async function ensureChineseBody(ai: AIService, body: string): Promise<string> {
  const text = body.trim();
  if (!text) return body;
  if (isMostlyChinese(text, 0.1)) return body;

  try {
    const translated = (await ai.translateContent(text)).trim();
    if (isMostlyChinese(translated, 0.08)) return translated;
  } catch {
    /* Keep the first translation if the guard translation fails. */
  }

  return body;
}
