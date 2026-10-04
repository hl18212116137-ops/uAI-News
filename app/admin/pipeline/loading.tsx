export default function LoadingPipeline() {
  return <main className="min-h-screen bg-[#f5f5f5] px-4 py-8" aria-busy="true" aria-label="正在加载采集管理">
    <div className="mx-auto max-w-200 space-y-6" aria-hidden>
      <div className="h-5 w-20" />
      <div className="skeleton h-8 w-32 rounded" />
      <div className="skeleton h-64 rounded-lg" />
    </div>
  </main>;
}
