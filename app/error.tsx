"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-6 font-sans">
      <section role="alert" className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-[#101828]">暂时无法加载内容</h1>
        <p className="mt-3 text-sm leading-6 text-[#6a7282]">请稍后重试，你的订阅和收藏仍然保留。</p>
        <button type="button" onClick={reset} className="btn-primary btn-press mt-6 rounded-md px-4 py-2 text-sm font-medium">重新加载</button>
      </section>
    </main>
  );
}
