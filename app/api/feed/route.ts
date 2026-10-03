import { isFeedStorageAvailable } from "@/lib/feed-availability";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getCachedHomeRecommendedPostPage,
  getCachedUserSubscribedFeedPage,
} from "@/lib/home-data-cache";
import { parseFeedPageQuery } from "@/lib/feed-pagination";
import { getUserSubscribedHandles } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const { searchParams } = new URL(request.url);
    const { offset, limit, filters, prioritizeRecentlyFetched } = parseFeedPageQuery(searchParams);


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
        if (page.total === 0 && !(await isFeedStorageAvailable())) return NextResponse.json({ success: false, error: "资讯暂时无法加载，请稍后重试。" }, { status: 503 });
        return NextResponse.json({
          success: true,
          feedType: "personal",
          ...page,
        });
      }
    }

    const page = await getCachedHomeRecommendedPostPage(offset, limit, user?.id ?? null, filters);
    if (page.total === 0 && !(await isFeedStorageAvailable())) return NextResponse.json({ success: false, error: "资讯暂时无法加载，请稍后重试。" }, { status: 503 });
    return NextResponse.json({
      success: true,
      feedType: "recommended",
      ...page,
    });
  } catch (error: unknown) {
    console.error("GET /api/feed:", error);
    return NextResponse.json({ success: false, error: "资讯暂时无法加载，请稍后重试。" }, { status: 500 });
  }
}
