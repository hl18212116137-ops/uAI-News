import { NextResponse } from "next/server";
import { getRecentLongformPostPreviewPage } from "@/lib/db";
import {
  clampFeedPageLimit,
  clampFeedPageOffset,
  LONGFORM_FEED_PAGE_SIZE,
} from "@/lib/feed-pagination";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hasPagingParams = searchParams.has("offset") || searchParams.has("limit");
    const offset = clampFeedPageOffset(searchParams.get("offset"));
    const limit = hasPagingParams
      ? clampFeedPageLimit(searchParams.get("limit"), LONGFORM_FEED_PAGE_SIZE)
      : 40;
    const page = await getRecentLongformPostPreviewPage(offset, limit);
    return NextResponse.json({ success: true, ...page });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to load longform posts" },
      { status: 500 }
    );
  }
}
