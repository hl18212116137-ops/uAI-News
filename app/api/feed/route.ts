import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getCachedHomeRecommendedPostPage,
  getCachedUserSubscribedFeedPage,
} from "@/lib/home-data-cache";
import {
  clampFeedPageLimit,
  clampFeedPageOffset,
  type FeedPageFilters,
  HOME_FEED_PAGE_SIZE,
} from "@/lib/feed-pagination";
import { getUserSubscribedHandles } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const { searchParams } = new URL(request.url);
    const offset = clampFeedPageOffset(searchParams.get("offset"));
    const limit = clampFeedPageLimit(searchParams.get("limit"), HOME_FEED_PAGE_SIZE);
    const filters: FeedPageFilters = {
      sourceHandle: searchParams.get("source") || undefined,
      category: searchParams.get("category") || undefined,
      searchQuery: searchParams.get("q") || undefined,
    };
    const prioritizeRecentlyFetched = searchParams.get("fresh") === "1";

    if (user) {
      const subscribedHandles = await getUserSubscribedHandles(user.id);
      if (subscribedHandles.length > 0) {
        const page = await getCachedUserSubscribedFeedPage(
          user.id,
          offset,
          limit,
          subscribedHandles,
          filters,
          { prioritizeRecentlyFetched }
        );
        return NextResponse.json({
          success: true,
          feedType: "personal",
          ...page,
        });
      }
    }

    const page = await getCachedHomeRecommendedPostPage(offset, limit, user?.id ?? null, filters);
    return NextResponse.json({
      success: true,
      feedType: "recommended",
      ...page,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load feed";
    console.error("GET /api/feed:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
