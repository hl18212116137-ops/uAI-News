export default function LoadingNews() {
  return <main className="min-h-screen bg-[#f5f5f5] px-4 py-8 sm:px-6 sm:py-10" aria-busy="true" aria-label="正在加载文章">
    <div className="mx-auto max-w-200 space-y-6 rounded-md border border-[#f3f4f6] bg-white p-6 shadow-sm sm:p-8" aria-hidden>
      <div className="skeleton h-5 w-40 rounded" />
      <div className="skeleton h-10 w-3/4 rounded" />
      <div className="skeleton h-24 rounded" />
      <div className="skeleton h-64 rounded" />
    </div>
  </main>;
}
