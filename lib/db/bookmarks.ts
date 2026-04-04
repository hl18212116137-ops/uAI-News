import 'server-only'

import { supabase } from '@/lib/supabase'

export async function listUserBookmarkNewsItemIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_bookmarks')
    .select('news_item_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map((r: { news_item_id: string }) => r.news_item_id)
}

export async function insertUserBookmark(userId: string, newsItemId: string): Promise<void> {
  const { error } = await supabase
    .from('user_bookmarks')
    .insert({ user_id: userId, news_item_id: newsItemId })

  if (error && error.code !== '23505') throw error
}

export async function deleteUserBookmark(userId: string, newsItemId: string): Promise<void> {
  const { error } = await supabase
    .from('user_bookmarks')
    .delete()
    .eq('user_id', userId)
    .eq('news_item_id', newsItemId)

  if (error) throw error
}
