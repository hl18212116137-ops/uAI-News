import { memo } from "react";
import { NewsItem } from "@/lib/types";
import NewsCard from "./NewsCard";
import EmptyState from "./EmptyState";

type SourceMeta = {
  id: string;
  handle: string;
  name: string;
  avatar?: string;
};

type NewsListProps = {
  posts: NewsItem[];
  sources?: SourceMeta[];
  bookmarkedIds?: Set<string>;
  onBookmarkToggle?: (id: string) => void;
};

export default memo(NewsList);

function NewsList({ posts, sources = [], bookmarkedIds, onBookmarkToggle }: NewsListProps) {
  if (posts.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-4">
      {posts.map((post) => (
        <NewsCard
          key={post.id}
          post={post}
          sources={sources}
          isBookmarked={bookmarkedIds?.has(post.id) ?? false}
          onBookmarkToggle={onBookmarkToggle}
        />
      ))}
    </div>
  );
}
