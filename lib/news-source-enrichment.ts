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

  return merged
}
