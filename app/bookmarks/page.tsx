export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db/drizzle'
import { userBookmarks, newsItems } from '@/lib/db/schema'
import { eq, inArray, desc } from 'drizzle-orm'
import NewsCard from '@/components/NewsCard'
import {
  mediaUrlsFromDbJson,
  referencedPostFromDbJson,
  socialEngagementFromDbJson,
  withCanonicalPostSourceUrl,
} from '@/lib/db/news'
import { NewsItem } from '@/lib/types'

export default async function BookmarksPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login?redirectTo=/bookmarks')
  }

  const bookmarkRows = await db
    .select({ newsItemId: userBookmarks.newsItemId })
    .from(userBookmarks)
    .where(eq(userBookmarks.userId, user.id))
    .orderBy(desc(userBookmarks.createdAt))

  const ids = bookmarkRows.map((r) => r.newsItemId)

  let bookmarkedNews: NewsItem[] = []
  if (ids.length > 0) {
    const items = await db
      .select()
      .from(newsItems)
      .where(inArray(newsItems.id, ids))

    if (items.length > 0) {
      const itemMap = new Map(items.map((item) => [item.id, item]))
      bookmarkedNews = ids
        .map((id) => itemMap.get(id))
        .filter(Boolean)
        .map((item: any): NewsItem =>
          withCanonicalPostSourceUrl({
            id: item.id,
            title: item.title,
            summary: item.summary,
            content: item.content,
            source: {
              platform: item.sourcePlatform,
              name: item.sourceName,
              handle: item.sourceHandle,
              url: item.sourceUrl,
            },
            category: item.category,
            publishedAt: item.publishedAt,
            originalText: item.originalText,
            createdAt: item.createdAt,
            importanceScore: item.importanceScore,
            mediaUrls: mediaUrlsFromDbJson(item.mediaUrls),
            socialEngagement: socialEngagementFromDbJson(item.socialEngagement),
            referencedPost: referencedPostFromDbJson(item.referencedPost),
          }),
        )
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="app-divider-border-b mt-[56px]">
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
