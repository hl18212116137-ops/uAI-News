import { NextResponse } from 'next/server'
import { runPostInsightForRequest } from '@/lib/services/analysis-service'

export const maxDuration = 60

export async function POST(request: Request) {
  const result = await runPostInsightForRequest(request)

  switch (result.kind) {
    case 'rate_limited':
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          retryAfterSec: result.retryAfterSec,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(result.retryAfterSec),
          },
        }
      )
    case 'bad_request':
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    case 'not_found':
      return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 })
    case 'server_error':
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    case 'success':
      return NextResponse.json({
        success: true,
        analysis: result.analysis,
      })
  }
}
