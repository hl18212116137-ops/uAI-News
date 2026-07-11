import 'server-only'

import { execFile } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

export type VideoTranscriptResult = {
  url: string
  transcript: string
}

export class VideoTranscriptError extends Error {
  code: 'DISABLED' | 'UNAVAILABLE' | 'PAYMENT_REQUIRED' | 'AUTH_REQUIRED' | 'FAILED' | 'EMPTY'

  constructor(code: VideoTranscriptError['code'], message: string) {
    super(message)
    this.name = 'VideoTranscriptError'
    this.code = code
  }
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  const normalized = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function isLikelyVideoUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    const pathname = url.pathname.toLowerCase()

    if (host === 'youtu.be' || host.endsWith('youtube.com')) return true
    if (host.endsWith('bilibili.com') || host === 'b23.tv') return true
    if (host.endsWith('tiktok.com') || host === 'vm.tiktok.com') return true
    if (host.endsWith('douyin.com') || host.endsWith('iesdouyin.com')) return true
    if (host.endsWith('xiaohongshu.com') || host === 'xhslink.com') return true
    if (host.endsWith('vimeo.com')) return true
    if (host.endsWith('cnbc.com') && pathname.startsWith('/video/')) return true
    if (host.includes('video.twimg.com')) return true

    return /\.(mp4|m4v|mov|webm|mkv|avi|m3u8)(?:$|[?#])/i.test(pathname)
  } catch {
    return false
  }
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function collectSubtitleSegments(value: unknown, out: string[] = []): string[] {
  if (!value) return out
  if (Array.isArray(value)) {
    for (const item of value) collectSubtitleSegments(item, out)
    return out
  }
  if (typeof value !== 'object') return out

  const record = value as Record<string, unknown>
  const text =
    stringValue(record.text) ||
    stringValue(record.subtitle) ||
    stringValue(record.caption) ||
    stringValue(record.content)

  const hasTiming =
    record.start != null ||
    record.startTime != null ||
    record.end != null ||
    record.timestamp != null ||
    record.duration != null

  if (text && (hasTiming || Object.keys(record).length <= 6)) {
    out.push(text)
    return out
  }

  for (const key of [
    'subtitlesArray',
    'subtitles',
    'captions',
    'transcript',
    'segments',
    'detail',
    'data',
    'result',
  ]) {
    if (key in record) collectSubtitleSegments(record[key], out)
  }

  return out
}

function collectLongTextFields(value: unknown, out: string[] = []): string[] {
  if (!value) return out
  if (typeof value === 'string') {
    if (value.trim().length >= 200) out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) collectLongTextFields(item, out)
    return out
  }
  if (typeof value !== 'object') return out

  const record = value as Record<string, unknown>
  for (const key of ['transcript', 'subtitlesText', 'subtitleText', 'text', 'content']) {
    collectLongTextFields(record[key], out)
  }
  return out
}

function parseTranscript(stdout: string): string {
  const trimmed = stdout.trim()
  if (!trimmed) return ''

  try {
    const parsed = JSON.parse(trimmed)
    const segments = collectSubtitleSegments(parsed)
    const text = normalizeText(segments.join('\n'))
    if (text) return text

    const longText = normalizeText(collectLongTextFields(parsed).join('\n\n'))
    if (longText) return longText
  } catch {
    // Plain subtitle output is also valid.
  }

  return normalizeText(trimmed)
}

function bibiCommandCandidates(): string[] {
  const out: string[] = []
  if (process.env.BIBI_CLI_PATH?.trim()) out.push(process.env.BIBI_CLI_PATH.trim())
  out.push('bibi')

  const userProfile = process.env.USERPROFILE || process.env.HOME
  if (userProfile) {
    const windowsPath = path.join(userProfile, 'AppData', 'Local', 'BibiGPT', 'bibi.exe')
    if (existsSync(windowsPath)) out.push(windowsPath)
  }

  return Array.from(new Set(out))
}

function runBibiSubtitle(command: string, url: string): Promise<string> {
  const timeout = envInt('LONGFORM_VIDEO_TRANSCRIPT_TIMEOUT_MS', 120000)
  const maxBuffer = envInt('LONGFORM_VIDEO_TRANSCRIPT_MAX_BUFFER_BYTES', 20 * 1024 * 1024)

  return new Promise((resolve, reject) => {
    execFile(
      command,
      ['summarize', url, '--subtitle', '--json'],
      {
        timeout,
        maxBuffer,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout)
          return
        }

        const combined = `${stderr || ''}\n${stdout || ''}`
        if (combined.includes('[HTTP/402 Payment Required]')) {
          reject(new VideoTranscriptError('PAYMENT_REQUIRED', 'BibiGPT payment is required'))
          return
        }
        if (/unauthori[sz]ed|auth|login|token/i.test(combined)) {
          reject(new VideoTranscriptError('AUTH_REQUIRED', 'BibiGPT authentication is required'))
          return
        }
        reject(error)
      },
    )
  })
}

export async function extractVideoTranscriptFromUrl(url: string): Promise<VideoTranscriptResult> {
  if (!envBool('LONGFORM_VIDEO_TRANSCRIPT_ENABLED', true)) {
    throw new VideoTranscriptError('DISABLED', 'Video transcript extraction is disabled')
  }

  const provider = (process.env.LONGFORM_VIDEO_TRANSCRIPT_PROVIDER || 'bibi-cli').trim().toLowerCase()
  if (provider !== 'bibi-cli') {
    throw new VideoTranscriptError('UNAVAILABLE', `Unsupported video transcript provider: ${provider}`)
  }

  let lastError: unknown
  for (const command of bibiCommandCandidates()) {
    try {
      const stdout = await runBibiSubtitle(command, url)
      const maxChars = envInt('LONGFORM_VIDEO_TRANSCRIPT_MAX_CHARS', 36000)
      const transcript = parseTranscript(stdout).slice(0, maxChars).trim()
      if (!transcript) {
        throw new VideoTranscriptError('EMPTY', 'BibiGPT returned an empty transcript')
      }
      return { url, transcript }
    } catch (error) {
      if (error instanceof VideoTranscriptError && error.code !== 'UNAVAILABLE') throw error
      lastError = error
    }
  }

  const message = lastError instanceof Error ? lastError.message : 'BibiGPT CLI is unavailable'
  throw new VideoTranscriptError('UNAVAILABLE', message)
}
