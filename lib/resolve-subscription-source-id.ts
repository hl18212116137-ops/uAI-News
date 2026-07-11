import 'server-only'

import { inArray } from 'drizzle-orm'
import { db } from '@/lib/db/drizzle'
import { sources } from '@/lib/db/schema'
import { expandHandleQueryVariants } from '@/lib/source-avatar'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** 将推荐占位 id（uai-demo-rec-*）等解析为 sources 表中的真实 uuid */
export async function resolveSubscriptionSourceId(
  sourceId: string,
  sourceHandle: string
): Promise<string> {
  if (UUID_RE.test(sourceId)) return sourceId

  const handle = String(sourceHandle || '').trim().replace(/^@/, '')
  if (!handle) {
    throw new Error('请提供有效的 source_handle')
  }

  const row = await db
    .select({ id: sources.id })
    .from(sources)
    .where(inArray(sources.handle, expandHandleQueryVariants([handle])))
    .limit(1)
    .then((r) => r[0] ?? null)

  if (!row?.id) {
    throw new Error(`信息源 @${handle} 尚未入库，请先添加`)
  }

  return String(row.id)
}
