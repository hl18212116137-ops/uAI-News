export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getBookmarkedNews } from '@/lib/bookmarks'
import { getSources } from '@/lib/sources'
import NewsCard from '@/components/NewsCard'

export default async function BookmarksPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 未登录重定向到登录页
  if (!user) {
    redirect('/login?redirectTo=/bookmarks')
  }

  // 并行获取收藏新闻和信息源（信息源用于展示头像）
  const [bookmarkedNews, sources] = await Promise.all([
    getBookmarkedNews(user.id),
    getSources(),
  ])

  const sourceMeta = sources.map(s => ({
    id: s.id,
    handle: s.handle,
    name: s.name,
    avatar: s.avatar,
  }))

  return (
    <div className="min-h-screen bg-white">
      {/* 页头 */}
      <div className="mt-[70px] border-b border-[#e5e7eb]">
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

      {/* 内容区 */}
      <div className="max-w-[900px] mx-auto px-6 py-8">
        {bookmarkedNews.length === 0 ? (
          // 空状态
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
          // 收藏列表
          <div className="flex flex-col gap-4">
            {bookmarkedNews.map((post) => (
              <NewsCard
                key={post.id}
                post={post}
                sources={sourceMeta}
                isBookmarked={true}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
