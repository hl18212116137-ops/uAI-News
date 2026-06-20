import "server-only";

import { revalidateTag } from "next/cache";
import {
  HOME_RECOMMENDED_POSTS_CACHE_TAG,
  HOME_USER_BOOKMARKS_CACHE_TAG,
  HOME_USER_FEED_CACHE_TAG,
  HOME_USER_SOURCES_CACHE_TAG,
} from "@/lib/home-data-cache";

function safeRevalidateTag(tag: string) {
  try {
    revalidateTag(tag);
  } catch (error) {
    console.warn(`[home-cache] failed to revalidate tag "${tag}"`, error);
  }
}

export function revalidateHomeFeedCaches() {
  safeRevalidateTag(HOME_USER_FEED_CACHE_TAG);
  safeRevalidateTag(HOME_RECOMMENDED_POSTS_CACHE_TAG);
}

export function revalidateHomeSourceCaches() {
  safeRevalidateTag(HOME_USER_SOURCES_CACHE_TAG);
  revalidateHomeFeedCaches();
}

export function revalidateHomeBookmarkCaches() {
  safeRevalidateTag(HOME_USER_BOOKMARKS_CACHE_TAG);
}
