import MainContent from "@/components/MainContent";
import { getPostCountBySource, getLatestPostTimeBySource, getTopImportantNews } from "@/lib/news";
import { getSources } from "@/lib/sources";
import { getAllPosts } from "@/lib/db";
import { getStats } from "@/lib/stats";

type PageProps = {
  searchParams: { category?: string; query?: string; source?: string };
};

export default async function Home({ searchParams }: PageProps) {
  // 获取所有推文（不进行筛选，筛选在客户端进行）
  const allPosts = await getAllPosts();

  // 新增：获取最值得关注的新闻（仅在无筛选条件时显示）
  const topImportantNews = (!searchParams.category && !searchParams.query)
    ? await getTopImportantNews(3, 10)
    : [];

  // 获取博主列表和推文数量
  const sources = await getSources();
  const postCounts = getPostCountBySource(allPosts);
  const latestPostTimes = getLatestPostTimeBySource(allPosts);

  // 获取统计数据
  const stats = await getStats();

  const sourcesWithCounts = sources
    .filter((s) => s.enabled !== false)
    .map((s) => ({
      id: s.id,
      handle: s.handle,
      name: s.name,
      avatar: s.avatar,
      description: s.description,
      postCount: postCounts[s.handle.toLowerCase()] || 0,
      latestPostTime: latestPostTimes[s.handle.toLowerCase()],
      sourceType: s.sourceType,
    }));

  return (
    <MainContent
      initialPosts={allPosts}
      topImportantNews={topImportantNews}
      sources={sourcesWithCounts}
      totalCount={allPosts.length}
      stats={stats}
    />
  );
}
