/**
 * 本地 sources.json 缓存：用于补全 DB 中缺失的头像 / 简介（按 handle 不区分大小写）
 */
import catalog from '@/data/sources.json'

type CatalogRow = {
  handle: string
  avatar?: string
  description?: string
}

const BY_HANDLE = new Map<string, { avatar?: string; description?: string }>()

for (const row of catalog as CatalogRow[]) {
  const key = String(row.handle ?? '').trim().toLowerCase()
  if (!key) continue
  BY_HANDLE.set(key, {
    avatar: row.avatar?.trim() || undefined,
    description: row.description?.trim() || undefined,
  })
}

export function catalogProfileForHandle(handle: string): {
  avatar?: string
  description?: string
} | undefined {
  const key = String(handle ?? '').trim().toLowerCase()
  if (!key) return undefined
  return BY_HANDLE.get(key)
}
