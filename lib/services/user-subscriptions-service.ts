import 'server-only'

import {
  deleteUserSourceSubscription,
  insertUserSourceSubscription,
  listUserSubscribedSourceIds,
} from '@/lib/db/user-source-subscriptions'
import { resolveSubscriptionSourceId } from '@/lib/resolve-subscription-source-id'
import { scheduleStaleSourceFetchesForSourceId } from '@/lib/feed-stale-fetch'
import { getSourceById } from '@/lib/sources'

export async function getSubscribedSourceIdsForUser(userId: string): Promise<string[]> {
  return listUserSubscribedSourceIds(userId)
}

export async function subscribeUserToSource(
  userId: string,
  sourceId: string,
  sourceHandle: string
): Promise<{ sourceId: string; taskId: string | null }> {
  const resolvedId = await resolveSubscriptionSourceId(sourceId, sourceHandle)
  const source = await getSourceById(resolvedId)
  if (!source) throw new Error('信息源不存在')
  await insertUserSourceSubscription(userId, resolvedId, source.handle)
  const taskId = source.enabled
    ? await scheduleStaleSourceFetchesForSourceId(resolvedId, source.handle, userId)
    : null
  return { sourceId: resolvedId, taskId }
}

export async function unsubscribeUserFromSource(
  userId: string,
  sourceId: string
): Promise<void> {
  return deleteUserSourceSubscription(userId, sourceId)
}
