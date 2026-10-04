import BookmarkGlyph from "@/components/BookmarkGlyph";

export default function LoadingBookmarks() {
  return <div className="min-h-screen bg-white" aria-busy="true" aria-label="正在加载收藏">
    <div className="app-divider-border-b mt-14">
      <div className="mx-auto flex max-w-[900px] items-center gap-3 px-6 py-6">
        <div className="h-5 w-5" aria-hidden />
        <div>
          <div className="flex items-center gap-2"><BookmarkGlyph className="h-5 w-5 text-[#101828]" /><h1 className="text-xl font-semibold text-[#101828]">我的收藏</h1></div>
          <div className="mt-0.5 h-5 w-32" aria-hidden />
        </div>
      </div>
    </div>
    <div className="mx-auto max-w-[900px] space-y-4 px-6 py-8" aria-hidden>
      {[0, 1, 2].map((index) => <div key={index} className="skeleton h-40 rounded-md" />)}
    </div>
  </div>;
}
