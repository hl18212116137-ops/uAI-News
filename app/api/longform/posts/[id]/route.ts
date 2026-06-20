import { NextResponse } from "next/server";
import { getPostById } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id?: string }> }
) {
  try {
    const { id } = await params;
    const postId = String(id ?? "").trim();
    if (!postId) {
      return NextResponse.json({ success: false, error: "Missing post id" }, { status: 400 });
    }

    const post = await getPostById(decodeURIComponent(postId));
    if (!post?.longform?.translatedContent) {
      return NextResponse.json({ success: false, error: "Longform post not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, post });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to load longform post" },
      { status: 500 }
    );
  }
}
