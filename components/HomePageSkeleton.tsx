/**
 * 首页主框架骨架：与 app/loading.tsx、首页 Suspense fallback 共用，避免流式与导航加载态不一致。
 */
export default function HomePageSkeleton() {
  return (
    <div className="flex min-h-screen bg-white">
      <div className="app-divider-border-r h-screen w-[256px] flex-shrink-0 bg-white" />

      <div className="flex-1 min-w-0">
        <div className="app-divider-border-b h-[72px] bg-white skeleton" />

        <div className="px-6 pt-6 pb-10">
          <div className="max-w-[896px] mx-auto space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-[160px] rounded-2xl skeleton" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
