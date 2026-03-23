export const dynamic = 'force-dynamic'

import MainContent from "@/components/MainContent";
import { getPostCountBySource, getLatestPostTimeBySource, getTopImportantNewsFromPosts } from "@/lib/news";
import { getSources } from "@/lib/sources";
import { getAllPosts } from "@/lib/db";
import { getStatsFromData } from "@/lib/stats";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserBookmarkIds } from "@/lib/bookmarks";
import {
  getUserSubscribedHandles,
  getUserSubscribedSourceIds,
  getSubscribedFeed,
  getSubscribedSourcesMeta,
  getRecommendedSources,
  getTopRecommendedPosts,
} from "@/lib/subscriptions";

type PageProps = {
  searchParams: { category?: string; query?: string; source?: string };
};

export default async function Home({ searchParams }: PageProps) {
  // 先获取用户 session
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 判断是否有订阅（决定 feed 模式）
  const subscribedHandles = user ? await getUserSubscribedHandles(user.id) : [];
  const isPersonalFeed = user !== null && subscribedHandles.length > 0;

  if (isPersonalFeed) {
    // 已登录且有订阅：并行获取个性化数据
    const [
      subFeed,
      subSourcesMeta,
      recommendedSrcs,
      bookmarkedIds,
      subscribedSourceIds,
      allSources,
      allPosts,
    ] = await Promise.all([
      getSubscribedFeed(user!.id),
      getSubscribedSourcesMeta(user!.id),
      getRecommendedSources(user!.id, 5),
      getUserBookmarkIds(user!.id),
      getUserSubscribedSourceIds(user!.id),
      getSources(),
      getAllPosts(),
    ]);

    const stats = getStatsFromData(allPosts, allSources);

    const topImportantNews = (!searchParams.category && !searchParams.query)
      ? getTopImportantNewsFromPosts(subFeed, 3, 10)
      : [];

    return (
      <MainContent
        initialPosts={subFeed}
        topImportantNews={topImportantNews}
        sources={subSourcesMeta}
        recommendedSources={recommendedSrcs}
        totalCount={subFeed.length}
        stats={stats}
        user={user}
        initialBookmarkedIds={bookmarkedIds}
        initialSubscribedSourceIds={subscribedSourceIds}
        isPersonalFeed={true}
      />
    );
  } else {
    // 未登录 或 登录但无订阅：展示精选推荐内容
    const [
      recommendedPosts,
      allSources,
      allPosts,
      bookmarkedIds,
      subscribedSourceIds,
      recommendedSrcs,
    ] = await Promise.all([
      getTopRecommendedPosts(40),
      getSources(),
      getAllPosts(),
      user ? getUserBookmarkIds(user.id) : Promise.resolve([]),
      user ? getUserSubscribedSourceIds(user.id) : Promise.resolve([]),
      getRecommendedSources(user?.id ?? null, 5),
    ]);

    const stats = getStatsFromData(allPosts, allSources);

    const topImportantNews = (!searchParams.category && !searchParams.query)
      ? getTopImportantNewsFromPosts(recommendedPosts, 3, 10)
      : [];

    // 未登录 / 无订阅时，SourcesList 已订阅区为空，仅显示推荐区
    return (
      <MainContent
        initialPosts={recommendedPosts}
        topImportantNews={topImportantNews}
        sources={[]}
        recommendedSources={recommendedSrcs}
        totalCount={recommendedPosts.length}
        stats={stats}
        user={user}
        initialBookmarkedIds={bookmarkedIds}
        initialSubscribedSourceIds={subscribedSourceIds}
        isPersonalFeed={false}
      />
    );
  }
}
