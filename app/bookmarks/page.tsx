export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { supabase } from '@/lib/supabase'
import NewsCard from '@/components/NewsCard'
import {
  mediaUrlsFromDbJson,
  referencedPostFromDbJson,
  socialEngagementFromDbJson,
} from '@/lib/db/news'
import { NewsItem } from '@/lib/types'

export default async function BookmarksPage() {
  // 用带 session 的客户端验证用户身份
  const sessionClient = createSupabaseServerClient()
  const { data: { user } } = await sessionClient.auth.getUser()

  if (!user) {
    redirect('/login?redirectTo=/bookmarks')
  }

  // 用 service_role key 查询（绕过 RLS，安全性由上面的 getUser 保证）
  const bookmarksResult = await supabase
    .from('user_bookmarks')
    .select('news_item_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const ids = (bookmarksResult.data || []).map((r: any) => r.news_item_id)

  let bookmarkedNews: NewsItem[] = []
  if (ids.length > 0) {
    const { data: items, error: itemsErr } = await supabase
      .from('news_items')
      .select('*')
      .in('id', ids)

    if (items && items.length > 0) {
      const itemMap = new Map(items.map((item: any) => [item.id, item]))
      bookmarkedNews = ids
        .map((id: string) => itemMap.get(id))
        .filter(Boolean)
        .map((item: any): NewsItem => ({
          id: item.id,
          title: item.title,
          summary: item.summary,
          content: item.content,
          source: {
            platform: item.source_platform,
            name: item.source_name,
            handle: item.source_handle,
            url: item.source_url,
          },
          category: item.category,
          publishedAt: item.published_at,
          originalText: item.original_text,
          createdAt: item.created_at,
          importanceScore: item.importance_score,
          mediaUrls: mediaUrlsFromDbJson(item.media_urls),
          socialEngagement: socialEngagementFromDbJson(item.social_engagement),
          referencedPost: referencedPostFromDbJson(item.referenced_post),
        }))
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mt-[56px] border-b border-[#e5e7eb]">
        <div className="max-w-[900px] mx-auto px-6 py-6 flex items-center gap-3">
          <Link
            href="/"
            className="text-[#99a1af] hover:text-[#6a7282] transition-colors"
            aria-label="返回首页"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-[#101828]">我的收藏</h1>
            <p className="text-sm text-[#6a7282] mt-0.5">
              {bookmarkedNews.length > 0
                ? `共 ${bookmarkedNews.length} 篇文章`
                : '还没有收藏任何内容'}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-[900px] mx-auto px-6 py-8">
        {bookmarkedNews.length === 0 ? (
          <div className="text-center py-20 px-5 text-[#6a7282]">
            <div className="text-5xl mb-4">⭐</div>
            <p className="text-lg font-medium mb-2 text-[#101828]">还没有收藏任何文章</p>
            <p className="text-sm mb-6">在首页浏览新闻时，点击星形图标即可收藏</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#101828] text-white text-sm font-medium hover:bg-[#1f2937] transition-colors"
            >
              去浏览新闻
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {bookmarkedNews.map((post) => (
              <NewsCard
                key={post.id}
                post={post}
                isBookmarked={true}
                readonly={true}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
