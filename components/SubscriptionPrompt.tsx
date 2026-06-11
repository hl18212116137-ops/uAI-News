"use client";

type SubscriptionPromptProps = {
  onSubscribe: () => void;
  onViewRecommended: () => void;
};

export default function SubscriptionPrompt({
  onSubscribe,
  onViewRecommended,
}: SubscriptionPromptProps) {
  return (
    <div className="flex justify-center py-20">
      <div className="max-w-md w-full mx-4">
        <div className="card p-8 text-center">
          <div className="text-5xl mb-4">📭</div>
          <h2 className="text-xl font-semibold text-[#101828] mb-2">
            你尚未关注信息源
          </h2>
          <p className="text-sm text-[#6a7282] mb-8">
            关注信息源后，首页将只显示你关注的内容
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={onSubscribe}
              className="btn-primary btn-press rounded-lg px-4 py-3 text-sm font-medium transition-colors duration-200"
            >
              订阅信息源
            </button>
            <button
              onClick={onViewRecommended}
              className="px-4 py-3 text-sm font-medium text-[#6a7282] border border-[#e5e7eb] rounded-lg hover:bg-[#f9fafb] transition-colors duration-200"
            >
              不订阅，先获取随机推文
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
