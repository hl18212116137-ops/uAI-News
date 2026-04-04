import 'server-only'

import { supabase } from '@/lib/supabase'

export async function listUserSubscribedSourceIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_source_subscriptions')
    .select('source_id')
    .eq('user_id', userId)

  if (error) throw error
  return (data || []).map((r: { source_id: string }) => r.source_id)
}

export async function insertUserSourceSubscription(
  userId: string,
  sourceId: string,
  sourceHandle: string
): Promise<void> {
  const { error } = await supabase
    .from('user_source_subscriptions')
    .insert({ user_id: userId, source_id: sourceId, source_handle: sourceHandle })

  if (error && error.code !== '23505') throw error
}

export async function deleteUserSourceSubscription(
  userId: string,
  sourceId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_source_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('source_id', sourceId)

  if (error) throw error
}
