import { NextResponse } from "next/server";
import { getPostById, updateNewsItemLongform } from "@/lib/db";
import { getDefaultAIService } from "@/lib/ai/ai-factory";
import { enrichLongformArticle } from "@/lib/longform-enrichment";
import type { NewsItem } from "@/lib/types";

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

    if (!post.longform.readingContent?.trim()) {
      const aiService = getDefaultAIService();
      const enriched = await enrichLongformArticle(post.longform, aiService);
      if (enriched.readingContent?.trim()) {
        const saved = await updateNewsItemLongform(post.id, enriched);
        if (saved.ok) {
          return NextResponse.json({
            success: true,
            post: { ...post, longform: enriched } satisfies NewsItem,
          });
        }
      }
    }

    return NextResponse.json({ success: true, post });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to load longform post" },
      { status: 500 }
    );
  }
}
