import { sourceAvatarSvgForHandle } from '@/lib/source-avatar'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle?: string }> }
) {
  const { handle: routeHandle } = await params
  const rawHandle = String(routeHandle ?? '').trim()
  const handle = rawHandle ? decodeURIComponent(rawHandle) : 'source'

  return new Response(sourceAvatarSvgForHandle(handle), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
