/**
 * 仅主区骨架（顶栏由 HomePageShell 提供），作首页 Suspense fallback。
 */
export default function HomeBodySkeleton() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 bg-white">
      <div className="h-full w-[256px] shrink-0 border-r border-[#e5e7eb] skeleton" aria-hidden />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="h-[72px] shrink-0 border-b border-[#f3f4f6] skeleton" aria-hidden />
        <div className="min-h-0 flex-1 overflow-hidden px-8 pb-10 pt-6">
          <div className="mx-auto max-w-[896px] space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-[160px] rounded-2xl skeleton" aria-hidden />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
