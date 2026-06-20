import { NextResponse } from "next/server";
import { getRecentLongformPostPreviews } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const posts = await getRecentLongformPostPreviews();
    return NextResponse.json({ success: true, posts });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to load longform posts" },
      { status: 500 }
    );
  }
}
