import 'server-only'

import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db/drizzle'
import { userSourceSubscriptions } from '@/lib/db/schema'

export async function listUserSubscribedSourceIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ sourceId: userSourceSubscriptions.sourceId })
    .from(userSourceSubscriptions)
    .where(eq(userSourceSubscriptions.userId, userId))

  return rows.map((r) => r.sourceId)
}

export async function insertUserSourceSubscription(
  userId: string,
  sourceId: string,
  sourceHandle: string
): Promise<void> {
  try {
    await db.insert(userSourceSubscriptions).values({ userId, sourceId, sourceHandle })
  } catch (e: any) {
    if (e?.code !== '23505') throw e
  }
}

export async function deleteUserSourceSubscription(
  userId: string,
  sourceId: string
): Promise<void> {
  await db
    .delete(userSourceSubscriptions)
    .where(
      and(
        eq(userSourceSubscriptions.userId, userId),
        eq(userSourceSubscriptions.sourceId, sourceId)
      )
    )
}
