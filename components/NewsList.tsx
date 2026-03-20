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
};

export default function NewsList({ posts, sources = [] }: NewsListProps) {
  if (posts.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-4">
      {posts.map((post) => (
        <NewsCard key={post.id} post={post} sources={sources} />
      ))}
    </div>
  );
}
