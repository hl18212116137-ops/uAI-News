import { NextRequest, NextResponse } from 'next/server'
import { importContentFromUrl } from '@/lib/services/import-url-service'

/**
 * POST /api/import-from-url
 * 从 URL 导入内容
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        {
          success: false,
          message: '请提供有效的 URL',
          error: '缺少 url 参数',
        },
        { status: 400 }
      )
    }

    const result = await importContentFromUrl(url)
    const statusCode = result.success ? 200 : 400
    return NextResponse.json(result, { status: statusCode })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    console.error('[API] 导入失败:', error)

    return NextResponse.json(
      {
        success: false,
        message: '服务器错误',
        error: message,
      },
      { status: 500 }
    )
  }
}
