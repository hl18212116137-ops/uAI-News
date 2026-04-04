import 'server-only'

import type { NewsItem } from './types'
import { expandHandleQueryVariants, resolveSourceAvatarUrl } from './source-avatar'
import { supabase } from './supabase'

export type SourceProfileRow = {
  name: string
  avatar?: string
  description?: string
  platform?: string | null
}

/**
 * 按 handle 批量读取 sources 表，用于把真实头像/简介合并进 feed 的 NewsItem.source。
 */
export async function fetchSourceProfilesByHandles(
  handles: string[]
): Promise<Map<string, SourceProfileRow>> {
  const normalized = [...new Set(handles.map((h) => h.trim()).filter(Boolean))]
  if (normalized.length === 0) return new Map()

  const variants = expandHandleQueryVariants(normalized)
  const { data, error } = await supabase
    .from('sources')
    .select('handle, name, avatar, description, platform')
    .in('handle', variants)

  if (error) {
    console.error('fetchSourceProfilesByHandles:', error.message)
    return new Map()
  }

  const map = new Map<string, SourceProfileRow>()
  for (const row of data || []) {
    const key = String(row.handle).toLowerCase()
    const platform = row.platform != null ? String(row.platform) : null
    const dbAvatar = row.avatar ? String(row.avatar) : undefined
    map.set(key, {
      name: String(row.name ?? ''),
      avatar: resolveSourceAvatarUrl(row.handle, dbAvatar, platform),
      description: row.description ? String(row.description) : undefined,
      platform,
    })
  }
  return map
}

export function mergeSourceProfilesIntoPosts(
  posts: NewsItem[],
  profiles: Map<string, SourceProfileRow>
): NewsItem[] {
  const merged = posts.map((p) => {
    const key = p.source?.handle?.toLowerCase()
    if (!key) return p
    const prof = profiles.get(key)
    const mergedAvatar = prof
      ? prof.avatar
      : resolveSourceAvatarUrl(p.source?.handle, p.source?.avatar, p.source?.platform)

    if (!prof) {
      if (!mergedAvatar) return p
      return { ...p, source: { ...p.source, avatar: mergedAvatar } }
    }

    const name = prof.name?.trim()
    return {
      ...p,
      source: {
        ...p.source,
        name: name || p.source.name,
        avatar: mergedAvatar ?? p.source.avatar,
        description: prof.description ?? p.source.description,
      },
    }
  })

  // #region agent log
  if (typeof fetch !== 'undefined') {
    const sample = merged.slice(0, 8).map((p) => {
      const a = p.source?.avatar?.trim() || ''
      let host = 'none'
      try {
        if (a) host = new URL(a).hostname
      } catch {
        host = 'bad-url'
      }
      return { h: p.source?.handle?.slice(0, 24), host }
    })
    fetch('http://127.0.0.1:7244/ingest/bb9e1b63-49d7-497c-83f1-785c798544f6', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'a3f67d',
      },
      body: JSON.stringify({
        sessionId: 'a3f67d',
        hypothesisId: 'H1',
        location: 'news-source-enrichment.ts:mergeSourceProfilesIntoPosts',
        message: 'server merged avatar sample',
        data: { postCount: merged.length, profileMapSize: profiles.size, sample },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
  }
  // #endregion

  return merged
}
