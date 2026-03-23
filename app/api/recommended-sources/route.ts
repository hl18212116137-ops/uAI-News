import { NextRequest, NextResponse } from 'next/server';
import { getRecommendedSources } from '@/lib/subscriptions';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '3');
    const userIdParam = searchParams.get('userId');

    let userId: string | null = userIdParam;
    if (!userId) {
      const supabase = createSupabaseServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id || null;
    }

    const sources = await getRecommendedSources(userId, limit);

    return NextResponse.json({
      success: true,
      sources,
    });
  } catch (error: any) {
    console.error('Failed to get recommended sources:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取推荐信息源失败' },
      { status: 500 }
    );
  }
}
