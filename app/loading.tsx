export default function Loading() {
  return (
    <div className="flex min-h-screen bg-white">
      {/* Sidebar 骨架 */}
      <div className="w-[256px] h-screen flex-shrink-0 bg-white border-r border-[#e5e7eb]" />

      {/* 主内容骨架 */}
      <div className="flex-1 min-w-0">
        {/* Header 骨架 */}
        <div className="h-[72px] bg-white border-b border-[#f3f4f6] skeleton" />

        {/* 内容骨架 */}
        <div className="px-6 pt-6 pb-10">
          <div className="max-w-[896px] mx-auto space-y-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-[160px] rounded-2xl skeleton"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
