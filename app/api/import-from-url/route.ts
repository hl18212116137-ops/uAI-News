import { NextRequest, NextResponse } from 'next/server';
import { importFromUrl } from '@/lib/import/import-service';

/**
 * POST /api/import-from-url
 * 从 URL 导入内容
 */
export async function POST(request: NextRequest) {
  try {
    // 解析请求体
    const body = await request.json();
    const { url } = body;

    // 验证参数
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        {
          success: false,
          message: '请提供有效的 URL',
          error: '缺少 url 参数',
        },
        { status: 400 }
      );
    }

    // 调用导入服务
    const result = await importFromUrl(url);

    // 根据结果返回适当的状态码
    const statusCode = result.success ? 200 : 400;

    return NextResponse.json(result, { status: statusCode });
  } catch (error: any) {
    console.error('[API] 导入失败:', error);

    return NextResponse.json(
      {
        success: false,
        message: '服务器错误',
        error: error.message || '未知错误',
      },
      { status: 500 }
    );
  }
}
