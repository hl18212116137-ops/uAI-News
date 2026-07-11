"use client";

type EmptyStateProps = {
  /** 信息源已展示但 feed 仍为空（常见于首次抓取前） */
  awaitingFetch?: boolean;
  /** 未配置 X API 密钥 */
  missingTwitterKey?: boolean;
};

export default function EmptyState({
  awaitingFetch = false,
  missingTwitterKey = false,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
      <div className="mb-6 flex h-[64px] w-[64px] items-center justify-center rounded-[14px] border border-[#EBEBEF] bg-white shadow-xs">
        <div className="h-8 w-8 rounded bg-[#f3f4f6]" />
      </div>
      <p className="mb-1 text-[13px] font-medium leading-[1.6] text-[#111113]">
        {awaitingFetch ? "正在准备最新推文…" : "暂无动态"}
      </p>
      <p className="max-w-md text-[13px] leading-[1.6] text-[#8A8A93]">
        {missingTwitterKey
          ? "服务器未配置 TWITTERAPI_IO_KEY，无法从 X 抓取。请在 .env.local 填入密钥后重启 dev 服务。"
          : awaitingFetch
            ? "已触发后台抓取与中文摘要，通常 1–3 分钟内有内容。登录后可点顶栏「抓取更新」立即刷新。"
            : "添加信息源或点击「抓取更新」获取最新内容。"}
      </p>
      {!missingTwitterKey ? (
        <p className="mt-4 max-w-md text-[12px] leading-[1.6] text-[#99a1af]">
          诊断接口：<code className="font-mono text-[11px]">/api/health/feed</code>
        </p>
      ) : null}
    </div>
  );
}
