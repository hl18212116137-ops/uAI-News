import type { AuthUser } from "@/lib/auth";
import { unstable_cache } from "next/cache";
import MainContent from "@/components/MainContent";
import { getSourcesForStats } from "@/lib/sources";
import { getNewsItemsPostCountSummary } from "@/lib/db";
import { getStatsFromSourceListAndPostCounts, getStatsFromSubscribedFeed } from "@/lib/stats";
import { getUserBookmarkIds } from "@/lib/bookmarks";
import { createHomePerf } from "@/lib/home-perf";
import {
  getUserSubscribedSourceIds,
  getSubscribedFeed,
  getSubscribedSourcesMeta,
  getTopRecommendedPosts,
  getFeedByHandles,
  getSubscribedSourcesMetaByHandles,
  getRecommendedSources,
  RECOMMENDED_SIDEBAR_LIMIT,
} from "@/lib/subscriptions";

/** 匿名首页全库帖子数：短 TTL 缓存，减轻 Suspense 内双 COUNT 对冷启动的压力（可接受数十秒内略旧） */
const getCachedNewsItemsPostCountSummary = unstable_cache(
  () => getNewsItemsPostCountSummary(),
  ["home-anon-news-items-post-count-summary"],
  { revalidate: 45 }
);

export type HomeMainContentBlockProps = {
  user: AuthUser | null;
  subscribedHandles: string[];
  isPersonalFeed: boolean;
  isGuestPersonalFeed: boolean;
};

/**
 * 首页重数据：包在 Suspense 内，与 HomePageShell 顶栏并行（顶栏不等待本段）。
 */
export default async function HomeMainContentBlock({
  user,
  subscribedHandles,
  isPersonalFeed,
  isGuestPersonalFeed,
}: HomeMainContentBlockProps) {
  const perf = createHomePerf("feed");

  if (isPersonalFeed) {
    const [subFeed, subMetaOrGuestList, bookmarkedIds, recommendedSources] = await Promise.all([
      user ? getSubscribedFeed(user.id, subscribedHandles) : getFeedByHandles(subscribedHandles),
      user ? getSubscribedSourcesMeta(user.id) : getSubscribedSourcesMetaByHandles(subscribedHandles),
      user ? getUserBookmarkIds(user.id) : Promise.resolve([]),
      getRecommendedSources(user?.id ?? null, RECOMMENDED_SIDEBAR_LIMIT),
    ]);
    perf.segment("promise_all_personal");

    const subSourcesMeta = Array.isArray(subMetaOrGuestList)
      ? subMetaOrGuestList
      : subMetaOrGuestList.sources;
    const subscribedSourceIds = Array.isArray(subMetaOrGuestList)
      ? subMetaOrGuestList.map((s) => s.id)
      : subMetaOrGuestList.subscribedSourceIds;

    const stats = getStatsFromSubscribedFeed(subFeed, subSourcesMeta as any);
    const visiblePosts = isGuestPersonalFeed ? subFeed.slice(0, 5) : subFeed;
    perf.logTotal();

    return (
      <MainContent
        useShellLayout
        initialPosts={visiblePosts}
        sources={subSourcesMeta as any}
        recommendedSources={recommendedSources as any}
        totalCount={subFeed.length}
        stats={stats}
        user={user}
        initialBookmarkedIds={bookmarkedIds}
        initialSubscribedSourceIds={subscribedSourceIds}
        isPersonalFeed={true}
      />
    );
  }

  const [recommendedPosts, allSources, postCounts, bookmarkedIds, subscribedSourceIds, recommendedSources] =
    await Promise.all([
      getTopRecommendedPosts(40),
      getSourcesForStats(),
      getCachedNewsItemsPostCountSummary(),
      user ? getUserBookmarkIds(user.id) : Promise.resolve([]),
      user ? getUserSubscribedSourceIds(user.id) : Promise.resolve([]),
      getRecommendedSources(user?.id ?? null, RECOMMENDED_SIDEBAR_LIMIT),
    ]);
  perf.segment("promise_all_guest");

  const stats = getStatsFromSourceListAndPostCounts(
    allSources,
    postCounts.totalPosts,
    postCounts.todayPosts
  );
  perf.logTotal();

  return (
    <MainContent
      useShellLayout
      initialPosts={recommendedPosts}
      sources={[]}
      recommendedSources={recommendedSources as any}
      totalCount={recommendedPosts.length}
      stats={stats}
      user={user}
      initialBookmarkedIds={bookmarkedIds}
      initialSubscribedSourceIds={subscribedSourceIds}
      isPersonalFeed={false}
    />
  );
}
