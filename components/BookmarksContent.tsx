"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { AuthUser } from "@/lib/auth";
import type { NewsItem } from "@/lib/types";
import { useOpenLogin } from "@/hooks/useOpenLogin";
import { useBookmark } from "@/hooks/useBookmark";
import BookmarkGlyph from "@/components/BookmarkGlyph";
import NewsCard from "@/components/NewsCard";

type BookmarksContentProps = {
  initialPosts: NewsItem[];
  user: AuthUser;
};

export default function BookmarksContent({ initialPosts, user }: BookmarksContentProps) {
  const openLogin = useOpenLogin();
  const initialBookmarkedIds = useMemo(
    () => new Set(initialPosts.map((post) => post.id)),
    [initialPosts],
  );
  const { bookmarkedIds, pendingIds, bookmarkedItems, toggleBookmark } = useBookmark(
    initialBookmarkedIds,
    user,
    openLogin,
    { initialItems: initialPosts },
  );
  const visiblePosts = useMemo(
    () => {
      const itemById = new Map(initialPosts.map((post) => [post.id, post]));
      bookmarkedItems.forEach((post) => itemById.set(post.id, post));
      return Array.from(bookmarkedIds)
        .map((id) => itemById.get(id))
        .filter((post): post is NewsItem => post != null);
    },
    [initialPosts, bookmarkedIds, bookmarkedItems],
  );

  const countLabel =
    visiblePosts.length > 0 ? `共 ${visiblePosts.length} 篇文章` : "还没有收藏任何内容";

  return (
    <>
      <div className="app-divider-border-b mt-[56px]">
        <div className="mx-auto flex max-w-[900px] items-center gap-3 px-6 py-6">
          <Link
            href="/"
            className="text-[#99a1af] transition-colors hover:text-[#6a7282]"
            aria-label="返回首页"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <BookmarkGlyph className="h-5 w-5 text-[#101828]" />
              <h1 className="text-xl font-semibold text-[#101828]">我的收藏</h1>
            </div>
            <p className="mt-0.5 text-sm text-[#6a7282]">{countLabel}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[900px] px-6 py-8">
        {visiblePosts.length === 0 ? (
          <div className="px-5 py-20 text-center text-[#6a7282]">
            <div className="mb-4 flex justify-center">
              <BookmarkGlyph className="h-11 w-11 text-[#d7a220]" filled />
            </div>
            <p className="mb-2 text-lg font-medium text-[#101828]">还没有收藏任何文章</p>
            <p className="mb-6 text-sm">在首页浏览新闻时，点击书签图标即可收藏</p>
            <Link
              href="/"
              className="btn-press inline-flex items-center gap-2 rounded-md bg-[#101828] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1f2937]"
            >
              去浏览新闻
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {visiblePosts.map((post) => (
              <NewsCard
                key={post.id}
                post={post}
                isBookmarked={bookmarkedIds.has(post.id)}
                bookmarkPending={pendingIds.has(post.id)}
                onBookmarkToggle={toggleBookmark}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
