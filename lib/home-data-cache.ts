import "server-only";

import { unstable_cache } from "next/cache";
import { getBookmarkedIdsForUser } from "@/lib/services/bookmarks-service";
import {
  getSubscribedFeed,
  getSubscribedSourcesMeta,
  getTopRecommendedPosts,
  getUserSubscribedHandles,
  getUserSubscribedSourceIds,
} from "@/lib/subscriptions";
import {
  HOME_RECOMMENDED_PREFETCH_LIMIT,
  makeFeedPage,
  stripLongformPosts,
} from "@/lib/feed-pagination";

const USER_HOME_CACHE_SECONDS = 15;

export const HOME_USER_FEED_CACHE_TAG = "home-user-feed";
export const HOME_USER_SOURCES_CACHE_TAG = "home-user-sources";
export const HOME_USER_BOOKMARKS_CACHE_TAG = "home-user-bookmarks";
export const HOME_RECOMMENDED_POSTS_CACHE_TAG = "home-recommended-posts";

function handlesCacheKey(handles: string[]): string {
  return handles.map((handle) => handle.trim()).filter(Boolean).join("\n");
}

function handlesFromCacheKey(key: string): string[] {
  return key.split("\n").map((handle) => handle.trim()).filter(Boolean);
}

const getCachedSubscribedFeedByHandles = unstable_cache(
  async (userId: string, handlesKey: string) => {
    return getSubscribedFeed(userId, handlesFromCacheKey(handlesKey));
  },
  ["home-user-subscribed-feed-v1"],
  { revalidate: USER_HOME_CACHE_SECONDS, tags: [HOME_USER_FEED_CACHE_TAG] }
);

const getCachedSubscribedSourcesMetaByUser = unstable_cache(
  async (userId: string, _handlesKey: string) => getSubscribedSourcesMeta(userId),
  ["home-user-subscribed-sources-meta-v1"],
  { revalidate: USER_HOME_CACHE_SECONDS, tags: [HOME_USER_SOURCES_CACHE_TAG] }
);

const getCachedBookmarkedIdsByUser = unstable_cache(
  async (userId: string) => getBookmarkedIdsForUser(userId),
  ["home-user-bookmarked-ids-v1"],
  { revalidate: USER_HOME_CACHE_SECONDS, tags: [HOME_USER_BOOKMARKS_CACHE_TAG] }
);

const getCachedSubscribedSourceIdsByUser = unstable_cache(
  async (userId: string) => getUserSubscribedSourceIds(userId),
  ["home-user-subscribed-source-ids-v1"],
  { revalidate: USER_HOME_CACHE_SECONDS, tags: [HOME_USER_SOURCES_CACHE_TAG] }
);

const getCachedTopRecommendedPostsByUser = unstable_cache(
  async (limit: number, userKey: string) => {
    return getTopRecommendedPosts(limit, userKey === "guest" ? null : userKey);
  },
  ["home-top-recommended-posts-v1"],
  { revalidate: USER_HOME_CACHE_SECONDS, tags: [HOME_RECOMMENDED_POSTS_CACHE_TAG] }
);

export async function getCachedUserSubscribedFeed(
  userId: string,
  subscribedHandles?: string[]
) {
  const handles = subscribedHandles ?? await getUserSubscribedHandles(userId);
  return getCachedSubscribedFeedByHandles(userId, handlesCacheKey(handles));
}

export async function getCachedUserSubscribedFeedPage(
  userId: string,
  offset: number,
  limit: number,
  subscribedHandles?: string[]
) {
  const posts = stripLongformPosts(await getCachedUserSubscribedFeed(userId, subscribedHandles));
  return makeFeedPage(posts, offset, limit);
}

export async function getCachedUserSubscribedSourcesMeta(
  userId: string,
  subscribedHandles?: string[]
) {
  const handles = subscribedHandles ?? await getUserSubscribedHandles(userId);
  return getCachedSubscribedSourcesMetaByUser(userId, handlesCacheKey(handles));
}

export async function getCachedUserBookmarkedIds(userId: string) {
  return getCachedBookmarkedIdsByUser(userId);
}

export async function getCachedUserSubscribedSourceIds(userId: string) {
  return getCachedSubscribedSourceIdsByUser(userId);
}

export async function getCachedHomeRecommendedPosts(limit: number, userId?: string | null) {
  return getCachedTopRecommendedPostsByUser(limit, userId ?? "guest");
}

export async function getCachedHomeRecommendedPostPage(
  offset: number,
  limit: number,
  userId?: string | null
) {
  const fetchLimit = Math.max(HOME_RECOMMENDED_PREFETCH_LIMIT, offset + limit);
  const posts = stripLongformPosts(await getCachedHomeRecommendedPosts(fetchLimit, userId));
  return makeFeedPage(posts, offset, limit);
}
