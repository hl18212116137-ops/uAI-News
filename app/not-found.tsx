import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f5f5f5] px-4 py-10">
      <section className="card w-full max-w-md p-6 text-center">
        <p className="text-sm text-[#99a1af]">404</p>
        <h1 className="mt-2 text-xl font-semibold text-[#101828]">内容不存在或暂时无法访问</h1>
        <p className="mt-3 text-sm leading-6 text-[#6a7282]">你可以返回首页继续浏览资讯。</p>
        <Link href="/" className="btn-primary btn-press mt-6 inline-flex rounded-md px-4 py-2 text-sm font-medium">返回首页</Link>
      </section>
    </main>
  )
}
