import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getCachedUserSubscribedFeed,
  getCachedUserSubscribedFeedPage,
} from "@/lib/home-data-cache";
import {
  clampFeedPageLimit,
  clampFeedPageOffset,
  type FeedPageFilters,
  HOME_FEED_PAGE_SIZE,
} from "@/lib/feed-pagination";

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const hasPaging = searchParams.has("offset") || searchParams.has("limit");

    if (hasPaging) {
      const offset = clampFeedPageOffset(searchParams.get("offset"));
      const limit = clampFeedPageLimit(searchParams.get("limit"), HOME_FEED_PAGE_SIZE);
      const filters: FeedPageFilters = {
        sourceHandle: searchParams.get("source") || undefined,
        category: searchParams.get("category") || undefined,
        searchQuery: searchParams.get("q") || undefined,
      };
      const page = await getCachedUserSubscribedFeedPage(
        user.id,
        offset,
        limit,
        undefined,
        filters,
        { prioritizeRecentlyFetched: searchParams.get("fresh") === "1" }
      );
      return NextResponse.json({ success: true, ...page });
    }

    const posts = await getCachedUserSubscribedFeed(user.id);
    return NextResponse.json({ success: true, posts, total: posts.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load subscribed feed";
    console.error("GET /api/me/subscribed-feed:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
