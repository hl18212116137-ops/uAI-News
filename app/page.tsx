export const dynamic = 'force-dynamic'

import MainContent from "@/components/MainContent";
import { getPostCountBySource, getLatestPostTimeBySource, getTopImportantNewsFromPosts } from "@/lib/news";
import { getSources } from "@/lib/sources";
import { getAllPosts } from "@/lib/db";
import { getStatsFromData } from "@/lib/stats";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserBookmarkIds } from "@/lib/bookmarks";

type PageProps = {
  searchParams: { category?: string; query?: string; source?: string };
};

export default async function Home({ searchParams }: PageProps) {
  // 先获取用户 session（后续并行查询依赖 user.id）
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 并行获取业务数据（收藏列表按用户是否登录条件查询）
  const [
    allPosts,
    sources,
    initialBookmarkedIds,
  ] = await Promise.all([
    getAllPosts(),
    getSources(),
    user ? getUserBookmarkIds(user.id) : Promise.resolve([]),
  ]);

  // 从已有数据派生，不重复查询 Supabase
  const topImportantNews = (!searchParams.category && !searchParams.query)
    ? getTopImportantNewsFromPosts(allPosts, 3, 10)
    : [];

  const postCounts = getPostCountBySource(allPosts);
  const latestPostTimes = getLatestPostTimeBySource(allPosts);
  const stats = getStatsFromData(allPosts, sources);

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
      user={user}
      initialBookmarkedIds={initialBookmarkedIds}
    />
  );
}
