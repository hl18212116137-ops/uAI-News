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
  subscribedIds?: Set<string>;
  onSubscriptionToggle?: (sourceId: string, sourceHandle: string) => void;
};

export default memo(NewsList);

function NewsList({ posts, sources = [], bookmarkedIds, onBookmarkToggle, subscribedIds, onSubscriptionToggle }: NewsListProps) {
  if (posts.length === 0) {
    return <EmptyState />;
  }

  // 从 sources 列表中查找与 source handle 匹配的 source.id
  const getSourceId = (handle: string) => {
    return sources.find(s => s.handle?.toLowerCase() === handle.toLowerCase())?.id ?? handle;
  };

  return (
    <div className="flex flex-col gap-4">
      {posts.map((post) => {
        const sourceHandle = post.source?.handle ?? '';
        const sourceId = getSourceId(sourceHandle);
        return (
          <NewsCard
            key={post.id}
            post={post}
            sources={sources}
            isBookmarked={bookmarkedIds?.has(post.id) ?? false}
            onBookmarkToggle={onBookmarkToggle}
            isSourceSubscribed={subscribedIds ? subscribedIds.has(sourceId) : undefined}
            onSubscriptionToggle={onSubscriptionToggle}
            sourceId={sourceId}
          />
        );
      })}
    </div>
  );
}
