import type { LongformDigestDraft, LongformDigestInput } from './ai-service'

const DIGEST_CONTENT_MAX_CHARS = 9000
const SUMMARY_MAX_CHARS = 60
const POINT_MAX_CHARS = 58

function normalizeText(text: unknown): string {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
}

function trimSentence(text: string, maxChars: number): string {
  const clean = normalizeText(text)
    .replace(/^(这篇文章|本文|文章)(主要)?(讲|讨论|介绍|研究)[:：，,]?\s*/, '')
    .replace(/^(重点是|核心是|结论是)[:：，,]?\s*/, '')
    .replace(/[；;，,\s]+$/g, '')
  if (!clean) return ''
  const clipped = clean.length > maxChars ? `${clean.slice(0, maxChars).replace(/[；;，,\s]+$/g, '')}…` : clean
  return /[。！？!?]$/.test(clipped) ? clipped : `${clipped}。`
}

export function buildLongformDigestPrompt(input: LongformDigestInput): string {
  const title = normalizeText(input.title) || '未命名文章'
  const content = normalizeText(input.content).slice(0, DIGEST_CONTENT_MAX_CHARS)

  return `你要给一个 AI 资讯应用生成长文卡片摘要。

目标：让用户几秒钟知道“这篇文章讲什么，重点是哪 3 个”。

写法要求：
- 用大白话，不要学术腔，不要营销腔。
- 不要摘高信号原句，要读完整体后概括。
- 不要废话，不要写“本文主要”“这篇文章主要”。
- summary 一句话，40 字以内，说清这篇文章讲什么。
- points 恰好 3 条，每条 45 字以内，按“问题 / 做法 / 结果或意义”的顺序写。
- 如果文章是论文，保留关键模型名、方法名和重要数字。
- 只返回 JSON，不要 Markdown，不要解释。

JSON 格式：
{
  "summary": "一句话讲什么",
  "points": ["重点1", "重点2", "重点3"]
}

标题：
${title}

正文：
${content}`
}

export function parseLongformDigestResponse(responseText: string): LongformDigestDraft {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in longform digest response')

  const parsed = JSON.parse(jsonMatch[0]) as { summary?: unknown; points?: unknown }
  const summary = trimSentence(normalizeText(parsed.summary), SUMMARY_MAX_CHARS)
  const points = Array.isArray(parsed.points)
    ? parsed.points
        .map((point) => trimSentence(point, POINT_MAX_CHARS))
        .filter((point) => point.length >= 6)
        .slice(0, 3)
    : []

  if (!summary && points.length === 0) {
    throw new Error('Longform digest response is empty')
  }

  return { summary, points }
}
