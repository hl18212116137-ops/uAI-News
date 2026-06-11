import { catalogProfileForHandle } from '@/lib/source-catalog'
import { resolveSourceAvatarUrl } from '@/lib/source-avatar'
import { resolveSourceDescription } from '@/lib/source-bio-fallback'

export type ResolvedSourceProfile = {
  avatar: string
  description: string
}

/**
 * 统一解析信息源头像 + 简介（展示与入库均应经此函数）
 * 优先级：DB/入参 → sources.json 缓存 → 推荐池 / unavatar / 通用占位
 */
export function resolveSourceProfile(input: {
  handle: string
  platform?: string | null
  avatar?: string | null
  description?: string | null
}): ResolvedSourceProfile {
  const catalog = catalogProfileForHandle(input.handle)

  const avatar = resolveSourceAvatarUrl(
    input.handle,
    input.avatar?.trim() || catalog?.avatar || null,
    input.platform ?? 'X'
  )

  const description = resolveSourceDescription(
    input.description?.trim() || catalog?.description || null,
    input.handle
  )

  return { avatar, description }
}
