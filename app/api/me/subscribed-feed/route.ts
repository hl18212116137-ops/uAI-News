import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getCachedUserSubscribedFeed,
  getCachedUserSubscribedFeedPage,
} from "@/lib/home-data-cache";
import { parseFeedPageQuery } from "@/lib/feed-pagination";
import { isFeedStorageAvailable } from "@/lib/feed-availability";

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const hasPaging = searchParams.has("offset") || searchParams.has("limit");

    if (hasPaging) {
      const { offset, limit, filters, prioritizeRecentlyFetched } = parseFeedPageQuery(searchParams);
      const page = await getCachedUserSubscribedFeedPage(
        user.id,
        offset,
        limit,
        undefined,
        filters,
        { prioritizeRecentlyFetched }
      );
      if (page.total === 0 && !(await isFeedStorageAvailable())) {
        return NextResponse.json({ success: false, error: "资讯暂时无法加载，请稍后重试。" }, { status: 503 });
      }
      return NextResponse.json({ success: true, ...page });
    }

    const posts = await getCachedUserSubscribedFeed(user.id);
    if (posts.length === 0 && !(await isFeedStorageAvailable())) {
      return NextResponse.json({ success: false, error: "资讯暂时无法加载，请稍后重试。" }, { status: 503 });
    }
    return NextResponse.json({ success: true, posts, total: posts.length });
  } catch (error: unknown) {
    console.error("GET /api/me/subscribed-feed:", error);
    return NextResponse.json({ success: false, error: "资讯暂时无法加载，请稍后重试。" }, { status: 500 });
  }
}
