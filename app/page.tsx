/**
 * 首页按登录态与订阅组合拉取不同 feed，需每次请求读 session + DB。
 * 不宜整页 ISR；若要做性能优化，可拆「公共推荐壳」与「个性化片段」或加 CDN 边缘缓存策略。
 */
export const dynamic = "force-dynamic";

import MainContent from "@/components/MainContent";
import { getSources } from "@/lib/sources";
import { getNewsItemsPostCountSummary } from "@/lib/db";
import { getStatsFromSourceListAndPostCounts, getStatsFromSubscribedFeed } from "@/lib/stats";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserBookmarkIds } from "@/lib/bookmarks";
import {
  getUserSubscribedHandles,
  getUserSubscribedSourceIds,
  getSubscribedFeed,
  getSubscribedSourcesMeta,
  getRecommendedSources,
  getTopRecommendedPosts,
  getDefaultSubscribedHandles,
  getFeedByHandles,
  getSubscribedSourcesMetaByHandles,
  ensureDefaultSubscriptions,
} from "@/lib/subscriptions";

export default async function Home() {
  // 先获取用户 session
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 访客模式：也给 3 个默认 handles，避免首页空数据
  const guestHandles = user ? [] : await getDefaultSubscribedHandles(3);

  // 判断是否有订阅（决定 feed 模式）
  let subscribedHandles = user ? await getUserSubscribedHandles(user.id) : guestHandles;

  if (user && subscribedHandles.length === 0) {
    await ensureDefaultSubscriptions(user.id, 3);
    subscribedHandles = await getUserSubscribedHandles(user.id);
  }

  const isPersonalFeed = subscribedHandles.length > 0;
  const isGuestPersonalFeed = !user && isPersonalFeed;

  if (isPersonalFeed) {
    // 个性化数据：统计与当前 Feed / SOURCES 对齐（不依赖全库聚合）
    const [subFeed, subSourcesMeta, recommendedSrcs, bookmarkedIds, subscribedSourceIdsFromDb] =
      await Promise.all([
        user ? getSubscribedFeed(user.id) : getFeedByHandles(subscribedHandles),
        user ? getSubscribedSourcesMeta(user.id) : getSubscribedSourcesMetaByHandles(subscribedHandles),
        getRecommendedSources(user?.id ?? null, 2),
        user ? getUserBookmarkIds(user.id) : Promise.resolve([]),
        user ? getUserSubscribedSourceIds(user.id) : Promise.resolve([] as string[]),
      ]);

    const subscribedSourceIds = user
      ? subscribedSourceIdsFromDb
      : subSourcesMeta.map((s) => s.id);

    const stats = getStatsFromSubscribedFeed(subFeed, subSourcesMeta);

    // 访客默认 feed：仅首屏展示 5 条，其余保留在 stats / 后续扩展中
    const visiblePosts = isGuestPersonalFeed ? subFeed.slice(0, 5) : subFeed;

    return (
      <MainContent
        initialPosts={visiblePosts}
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
      postCounts,
      bookmarkedIds,
      subscribedSourceIds,
      recommendedSrcs,
    ] = await Promise.all([
      getTopRecommendedPosts(40),
      getSources(),
      getNewsItemsPostCountSummary(),
      user ? getUserBookmarkIds(user.id) : Promise.resolve([]),
      user ? getUserSubscribedSourceIds(user.id) : Promise.resolve([]),
      getRecommendedSources(user?.id ?? null, 2),
    ]);

    const stats = getStatsFromSourceListAndPostCounts(
      allSources,
      postCounts.totalPosts,
      postCounts.todayPosts
    );

    // 未登录 / 无订阅时，SourcesList 已订阅区为空，仅显示推荐区
    return (
      <MainContent
        initialPosts={recommendedPosts}
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
