import 'server-only'

import type { XReferencedPost } from '@/lib/types'

type VisionConfig = {
  apiUrl: string
  apiKey: string
  model: string
}

export type TweetImageText = {
  imageUrl: string
  text: string
  source: 'tweet' | 'referenced'
  confidence?: number
}

const DEFAULT_VISION_API_URL = 'https://api.openai.com/v1/chat/completions'

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function getVisionConfig(): VisionConfig | null {
  const apiKey =
    process.env.PASS_RESTORE_VISION_API_KEY ||
    process.env.LONGFORM_VISION_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ''
  const model =
    process.env.PASS_RESTORE_VISION_MODEL ||
    process.env.LONGFORM_VISION_MODEL ||
    'gpt-4o-mini'

  if (!apiKey || !model) return null

  return {
    apiUrl:
      process.env.PASS_RESTORE_VISION_API_URL ||
      process.env.LONGFORM_VISION_API_URL ||
      DEFAULT_VISION_API_URL,
    apiKey,
    model,
  }
}

function isLikelyImageUrl(url: string): boolean {
  const lower = url.toLowerCase()
  if (!lower.startsWith('https://')) return false
  if (lower.includes('.mp4') || lower.includes('video.twimg.com')) return false
  return true
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  try {
    const parsed = JSON.parse(cleaned)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1))
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
    } catch {
      return null
    }
  }
}

function normalizeOcrText(value: unknown): string {
  const text = String(value ?? '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const maxChars = envInt('PASS_RESTORE_OCR_TEXT_MAX_CHARS', 1200)
  return text.length > maxChars ? `${text.slice(0, maxChars).trim()}...` : text
}

async function extractOneImageText(
  imageUrl: string,
  source: TweetImageText['source'],
  context: {
    tweetText: string
    authorName: string
    authorHandle: string
  }
): Promise<TweetImageText | null> {
  const config = getVisionConfig()
  if (!config) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), envInt('PASS_RESTORE_VISION_TIMEOUT_MS', 20000))

  try {
    const res = await fetch(config.apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are an OCR assistant for X/Twitter images. Return only JSON with keys: hasReadableText, text, confidence. Extract visible text from screenshots, charts, documents, UI screenshots, memes, or code images. Do not describe the image unless the description is necessary to preserve text meaning.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  `Tweet author: ${context.authorName} (@${context.authorHandle})\n` +
                  `Tweet text:\n${context.tweetText.slice(0, 1600)}\n\n` +
                  'If this image contains readable text, OCR it faithfully. If there is no meaningful text, return hasReadableText=false.',
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
      }),
    })

    if (!res.ok) return null
    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null

    const parsed = parseJsonObject(content)
    if (!parsed || parsed.hasReadableText !== true) return null

    const text = normalizeOcrText(parsed.text)
    if (!text) return null

    const confidence =
      typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : undefined

    return { imageUrl, text, source, ...(confidence != null ? { confidence } : {}) }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function extractTweetImageTexts(input: {
  tweetText: string
  authorName: string
  authorHandle: string
  mediaUrls?: string[]
  referencedPost?: XReferencedPost
}): Promise<TweetImageText[]> {
  const config = getVisionConfig()
  if (!config) return []

  const maxImages = envInt('PASS_RESTORE_OCR_MAX_IMAGES', 2)
  const candidates: Array<{ url: string; source: TweetImageText['source'] }> = []

  for (const url of input.mediaUrls ?? []) {
    if (isLikelyImageUrl(url)) candidates.push({ url, source: 'tweet' })
  }
  for (const url of input.referencedPost?.mediaUrls ?? []) {
    if (isLikelyImageUrl(url)) candidates.push({ url, source: 'referenced' })
  }

  const unique = Array.from(
    new Map(candidates.map((item) => [item.url, item])).values()
  ).slice(0, maxImages)

  const results = await Promise.all(
    unique.map((item) =>
      extractOneImageText(item.url, item.source, {
        tweetText: input.tweetText,
        authorName: input.authorName,
        authorHandle: input.authorHandle,
      })
    )
  )

  return results.filter((item): item is TweetImageText => Boolean(item))
}

export function appendImageTextsToTweetText(
  text: string,
  imageTexts: TweetImageText[],
  source: TweetImageText['source']
): string {
  const scoped = imageTexts.filter((item) => item.source === source && item.text.trim())
  if (scoped.length === 0) return text

  const block = scoped
    .map((item, index) => `截图 ${index + 1} 文字：\n${item.text}`)
    .join('\n\n')

  return `${text.trim()}\n\n---\n${block}`.trim()
}
