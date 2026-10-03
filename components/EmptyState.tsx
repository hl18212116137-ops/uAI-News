"use client";

export type FeedEmptyStatus = "empty" | "filtered" | "updating" | "unavailable";
const copy: Record<FeedEmptyStatus, { title: string; detail: string }> = {
  empty: { title: "暂无动态", detail: "当前阅读范围内还没有内容，可以调整订阅或阅读偏好，也可以稍后更新。" },
  filtered: { title: "暂无符合条件的内容", detail: "可以切换分类或信息源，查看其他动态。" },
  updating: { title: "正在更新资讯…", detail: "更新完成后，最新内容会自动显示。" },
  unavailable: { title: "资讯暂时无法加载", detail: "服务暂时不可用，请稍后重试。" },
};
export default function EmptyState({ status = "empty", onRetry, retrying = false }: { status?: FeedEmptyStatus; onRetry?: () => void; retrying?: boolean }) {
  return <div className="flex flex-col items-center justify-center px-4 py-24 text-center" role="status">
    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[14px] border border-[#ebebef] bg-white shadow-xs" aria-hidden>
      <div className="h-8 w-8 rounded bg-[#f3f4f6]" />
    </div>
    <p className="mb-1 text-[13px] font-medium leading-[1.6] text-[#111113]">{copy[status].title}</p>
    <p className="max-w-md text-[13px] leading-[1.6] text-[#8a8a93]">{copy[status].detail}</p>
    {status === "unavailable" && onRetry ? <button type="button" disabled={retrying} onClick={onRetry} className="btn-primary btn-press mt-5 rounded-md px-4 py-2 text-sm disabled:opacity-50">{retrying ? "正在重试…" : "重试"}</button> : null}
  </div>;
}
