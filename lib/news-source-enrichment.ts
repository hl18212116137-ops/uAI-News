import 'server-only'

import { inArray } from 'drizzle-orm'
import type { NewsItem } from './types'
import { expandHandleQueryVariants } from './source-avatar'
import { resolveSourceProfile } from './source-profile'
import { db } from '@/lib/db/drizzle'
import { sources } from '@/lib/db/schema'

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

  let data: { handle: string; name: string; avatar: string | null; description: string | null; platform: string | null }[]
  try {
    data = await db
      .select({
        handle: sources.handle,
        name: sources.name,
        avatar: sources.avatar,
        description: sources.description,
        platform: sources.platform,
      })
      .from(sources)
      .where(inArray(sources.handle, variants))
  } catch (err: any) {
    console.error('fetchSourceProfilesByHandles:', err.message)
    return new Map()
  }

  const map = new Map<string, SourceProfileRow>()
  for (const row of data) {
    const key = String(row.handle).toLowerCase()
    const platform = row.platform != null ? String(row.platform) : null
    const profile = resolveSourceProfile({
      handle: row.handle,
      platform,
      avatar: row.avatar,
      description: row.description,
    })
    map.set(key, {
      name: String(row.name ?? ''),
      avatar: profile.avatar,
      description: profile.description,
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
    const profile = prof
      ? { avatar: prof.avatar, description: prof.description }
      : resolveSourceProfile({
          handle: p.source?.handle ?? '',
          platform: p.source?.platform ?? 'X',
          avatar: p.source?.avatar,
          description: p.source?.description,
        })

    if (!prof && !profile.avatar && !profile.description) return p

    const name = prof?.name?.trim()
    return {
      ...p,
      source: {
        ...p.source,
        name: name || p.source.name,
        avatar: profile.avatar || p.source.avatar,
        description: profile.description || p.source.description,
      },
    }
  })

  return merged
}
