import 'server-only'

import {
  deleteUserSourceSubscription,
  insertUserSourceSubscription,
  listUserSubscribedSourceIds,
} from '@/lib/db/user-source-subscriptions'

export async function getSubscribedSourceIdsForUser(userId: string): Promise<string[]> {
  return listUserSubscribedSourceIds(userId)
}

export async function subscribeUserToSource(
  userId: string,
  sourceId: string,
  sourceHandle: string
): Promise<void> {
  return insertUserSourceSubscription(userId, sourceId, sourceHandle)
}

export async function unsubscribeUserFromSource(
  userId: string,
  sourceId: string
): Promise<void> {
  return deleteUserSourceSubscription(userId, sourceId)
}
