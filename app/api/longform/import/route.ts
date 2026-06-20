import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import {
  getLongformUploadLimitBytes,
  importLongformFromTextFile,
  importLongformFromUrl,
  isSupportedLongformFile,
} from '@/lib/longform-import'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const url = formData.get('url')

    if (file instanceof File && file.size > 0) {
      if (file.size > getLongformUploadLimitBytes()) {
        return NextResponse.json(
          { success: false, error: '文件太大，请上传 4MB 以内的文章文件' },
          { status: 400 },
        )
      }

      if (!isSupportedLongformFile(file.name, file.type)) {
        return NextResponse.json(
          { success: false, error: '目前支持 txt、md、html 这类文本文章文件' },
          { status: 400 },
        )
      }

      const text = await file.text()
      const result = await importLongformFromTextFile({
        fileName: file.name,
        mimeType: file.type,
        text,
      })
      revalidatePath('/')
      return NextResponse.json({ success: true, ...result })
    }

    if (typeof url === 'string' && url.trim()) {
      const result = await importLongformFromUrl(url)
      revalidatePath('/')
      return NextResponse.json({ success: true, ...result })
    }

    return NextResponse.json(
      { success: false, error: '请输入文章 URL，或拖入一个文章文件' },
      { status: 400 },
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '导入长文失败'
    console.error('[longform import] failed:', error)
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
