import type { AuthUser } from "@/lib/auth";
import { unstable_cache } from "next/cache";
import MainContent from "@/components/MainContent";
import { getSourcesForStats } from "@/lib/sources";
import { getNewsItemsPostCountSummary } from "@/lib/db";
import { getStatsFromSourceListAndPostCounts, getStatsFromSubscribedFeed } from "@/lib/stats";
import { createHomePerf } from "@/lib/home-perf";
import {
  HOME_RECOMMENDED_POSTS_CACHE_TAG,
  HOME_USER_FEED_CACHE_TAG,
  HOME_USER_SOURCES_CACHE_TAG,
  getCachedHomeRecommendedPosts,
  getCachedUserBookmarkedIds,
  getCachedUserSubscribedFeed,
  getCachedUserSubscribedFeedPage,
  getCachedUserSubscribedSourceIds,
  getCachedUserSubscribedSourcesMeta,
} from "@/lib/home-data-cache";
import {
  HOME_FEED_PAGE_SIZE,
  makeFeedPage,
  stripLongformPosts,
} from "@/lib/feed-pagination";
import {
  getFeedByHandles,
  getSubscribedSourcesMetaByHandles,
} from "@/lib/subscriptions";

/** 匿名首页全库帖子数：短 TTL 缓存，减轻 Suspense 内双 COUNT 对冷启动的压力（可接受数十秒内略旧） */
const getCachedNewsItemsPostCountSummary = unstable_cache(
  () => getNewsItemsPostCountSummary(),
  ["home-anon-news-items-post-count-summary"],
  { revalidate: 45, tags: [HOME_RECOMMENDED_POSTS_CACHE_TAG] }
);

const getCachedSourcesForStats = unstable_cache(
  () => getSourcesForStats(),
  ["home-sources-for-stats"],
  { revalidate: 45, tags: [HOME_USER_SOURCES_CACHE_TAG] }
);

const getCachedGuestFeedByHandles = unstable_cache(
  (handles: string[]) => getFeedByHandles(handles),
  ["home-guest-feed-by-handles"],
  { revalidate: 30, tags: [HOME_USER_FEED_CACHE_TAG] }
);

const getCachedGuestSourcesMetaByHandles = unstable_cache(
  (handles: string[]) => getSubscribedSourcesMetaByHandles(handles),
  ["home-guest-sources-meta-by-handles"],
  { revalidate: 45, tags: [HOME_USER_SOURCES_CACHE_TAG] }
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
    const [subFeed, subMetaOrGuestList, bookmarkedIds] = await Promise.all([
      user
        ? getCachedUserSubscribedFeed(user.id, subscribedHandles)
        : getCachedGuestFeedByHandles(subscribedHandles),
      user
        ? getCachedUserSubscribedSourcesMeta(user.id, subscribedHandles)
        : getCachedGuestSourcesMetaByHandles(subscribedHandles),
      user ? getCachedUserBookmarkedIds(user.id) : Promise.resolve([]),
    ]);
    perf.segment("promise_all_personal");

    const subSourcesMeta = Array.isArray(subMetaOrGuestList)
      ? subMetaOrGuestList
      : subMetaOrGuestList.sources;
    const subscribedSourceIds = Array.isArray(subMetaOrGuestList)
      ? subMetaOrGuestList.map((s) => s.id)
      : subMetaOrGuestList.subscribedSourceIds;

    const stats = getStatsFromSubscribedFeed(subFeed, subSourcesMeta);
    const feedPosts = stripLongformPosts(subFeed);
    const initialPage = user && !isGuestPersonalFeed
      ? await getCachedUserSubscribedFeedPage(
          user.id,
          0,
          HOME_FEED_PAGE_SIZE,
          subscribedHandles
        )
      : makeFeedPage(feedPosts, 0, 5);
    perf.logTotal();

    return (
      <MainContent
        useShellLayout
        initialPosts={initialPage.posts}
        sources={subSourcesMeta}
        deferRecommendedSources
        totalCount={feedPosts.length}
        stats={stats}
        user={user}
        initialBookmarkedIds={bookmarkedIds}
        initialSubscribedSourceIds={subscribedSourceIds}
        isPersonalFeed={true}
        initialFeedOffset={initialPage.nextOffset}
        initialFeedTotal={initialPage.total}
        initialFeedHasMore={!isGuestPersonalFeed && initialPage.hasMore}
        canLoadMoreFeed={!isGuestPersonalFeed}
      />
    );
  }

  const [recommendedPosts, allSources, postCounts, bookmarkedIds, subscribedSourceIds] =
    await Promise.all([
      getCachedHomeRecommendedPosts(40, user?.id ?? null),
      getCachedSourcesForStats(),
      getCachedNewsItemsPostCountSummary(),
      user ? getCachedUserBookmarkedIds(user.id) : Promise.resolve([]),
      user ? getCachedUserSubscribedSourceIds(user.id) : Promise.resolve([]),
    ]);
  perf.segment("promise_all_guest");

  const stats = getStatsFromSourceListAndPostCounts(
    allSources,
    postCounts.totalPosts,
    postCounts.todayPosts
  );
  const recommendedPage = makeFeedPage(
    stripLongformPosts(recommendedPosts),
    0,
    HOME_FEED_PAGE_SIZE
  );
  perf.logTotal();

  return (
    <MainContent
      useShellLayout
      initialPosts={recommendedPage.posts}
      sources={[]}
      deferRecommendedSources
      totalCount={recommendedPage.total}
      stats={stats}
      user={user}
      initialBookmarkedIds={bookmarkedIds}
      initialSubscribedSourceIds={subscribedSourceIds}
      isPersonalFeed={false}
      initialFeedOffset={recommendedPage.nextOffset}
      initialFeedTotal={recommendedPage.total}
      initialFeedHasMore={recommendedPage.hasMore}
      canLoadMoreFeed
    />
  );
}
