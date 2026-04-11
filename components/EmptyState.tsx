type EmptyStateProps = {
  /** Guest / offline placeholder sources: explain why the list may stay empty */
  demoSourcesHint?: boolean;
};

export default function EmptyState({ demoSourcesHint = false }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-[64px] h-[64px] rounded-[14px] border border-[#EBEBEF] bg-white shadow-xs flex items-center justify-center mb-6">
        <div className="w-8 h-8 rounded bg-[#f3f4f6]" />
      </div>
      <p className="text-[13px] font-medium text-[#111113] leading-[1.6] mb-1">暂无动态</p>
      <p className="text-[13px] text-[#8A8A93] leading-[1.6] max-w-md">
        添加信息源或点击「抓取」获取最新内容。
      </p>
      {demoSourcesHint ? (
        <p className="text-[12px] text-[#8A8A93] leading-[1.6] mt-4 max-w-md">
          当数据库暂不可访问或尚无数据时，会显示默认示例账号。待 Supabase 中有信息源与帖子后，刷新页面或再次抓取即可。
        </p>
      ) : null}
    </div>
  );
}
