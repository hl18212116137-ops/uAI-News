import { NextRequest, NextResponse } from 'next/server'
import { loadRecommendedSourcesForApi } from '@/lib/services/feed-service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const sources = await loadRecommendedSourcesForApi(request)
    return NextResponse.json({
      success: true,
      sources,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取推荐信息源失败'
    console.error('Failed to get recommended sources:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
