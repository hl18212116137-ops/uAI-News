import { catalogProfileForHandle } from '@/lib/source-catalog'
import {
  isFallbackSourceAvatarUrl,
  resolveSourceAvatarUrl,
} from '@/lib/source-avatar'
import { resolveSourceDescription } from '@/lib/source-bio-fallback'

export type ResolvedSourceProfile = {
  avatar: string
  description: string
}

/**
 * 统一解析信息源头像 + 简介（展示层入口）
 * 优先级：真实 DB/入参头像 → sources.json 缓存 → 本地生成占位
 */
export function resolveSourceProfile(input: {
  handle: string
  platform?: string | null
  avatar?: string | null
  description?: string | null
}): ResolvedSourceProfile {
  const catalog = catalogProfileForHandle(input.handle)
  const inputAvatar = input.avatar?.trim() || null
  const catalogAvatar = catalog?.avatar?.trim() || null
  const avatarCandidate =
    inputAvatar && !isFallbackSourceAvatarUrl(inputAvatar)
      ? inputAvatar
      : catalogAvatar || inputAvatar

  const avatar = resolveSourceAvatarUrl(
    input.handle,
    avatarCandidate,
    input.platform ?? 'X'
  )

  const description = resolveSourceDescription(
    input.description?.trim() || catalog?.description || null,
    input.handle
  )

  return { avatar, description }
}
