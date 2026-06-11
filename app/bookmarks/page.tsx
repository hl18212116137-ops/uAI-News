export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { getBookmarkedNewsForUser } from '@/lib/services/bookmarks-service'
import BookmarksContent from '@/components/BookmarksContent'

export default async function BookmarksPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login?redirectTo=/bookmarks')
  }

  const bookmarkedNews = await getBookmarkedNewsForUser(user.id)

  return (
    <div className="min-h-screen bg-white">
      <BookmarksContent initialPosts={bookmarkedNews} user={user} />
    </div>
  )
}
