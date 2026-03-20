import { NewsItem } from "@/lib/types";
import NewsCard from "./NewsCard";

type TopImportantNewsProps = {
  posts: NewsItem[];
};

export default function TopImportantNews({ posts }: TopImportantNewsProps) {
  if (posts.length === 0) {
    return null;
  }

  return (
    <div className="p-4 bg-white rounded-md shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-[#101828] mb-2 flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          最值得关注
        </h2>
        <p className="text-[13px] text-[#6a7282]">
          最近 3 天最重要的 10 条 AI 新闻
        </p>
      </div>

      <div className="bg-[#f5f5f5] rounded-md p-3">
        {posts.map((post, index) => (
          <div key={post.id} className="relative">
            {/* 排名标签 */}
            <div
              className={`
                absolute top-5 -left-1.5
                ${index < 3
                  ? 'bg-primary-600'
                  : 'bg-[#999aa0]'
                }
                text-white w-7 h-7 rounded-full
                flex items-center justify-center
                font-semibold text-sm shadow-sm z-10
              `}
            >
              {index + 1}
            </div>

            {/* 重要性评分标签 */}
            {post.importanceScore && (
              <div className="absolute top-5 right-5 bg-primary-100 text-primary-600 px-2 py-1 rounded text-[11px] font-medium z-10">
                热度：{post.importanceScore}
              </div>
            )}

            <div className="pl-7">
              <NewsCard post={post} variant="compact" />
            </div>

            {index < posts.length - 1 && (
              <div className="h-px bg-[#d1d5dc] my-4" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
