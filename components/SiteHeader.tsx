import StatsCards from "./StatsCards";

type SiteHeaderProps = {
  stats: {
    bloggerCount: number;
    mediaCount: number;
    academicCount: number;
    totalPosts: number;
    todayPosts: number;
  };
};

/** Figma uAI News 37:4684–4689（Title）+ 37:4690 HorizontalBorder（Stats 由 StatsCards 承接） */
export default function SiteHeader({ stats }: SiteHeaderProps) {
  return (
    <header data-name="Site header" className="w-full text-left">
      <div
        data-name="Title"
        data-node-id="37:4684"
        className="box-border flex h-[64px] max-h-[64px] min-h-[64px] w-full shrink-0 flex-col items-start overflow-hidden"
      >
        <div data-name="Heading 1" data-node-id="37:4685" className="flex w-full flex-col items-start">
          <h1
            className="m-0 w-full font-sans text-[26px] font-semibold leading-8 tracking-[-0.52px] text-[#111113] sm:text-[28px] sm:tracking-[-0.56px] lg:text-[32px] lg:tracking-[-0.64px]"
            data-node-id="37:4686"
          >
            uAI News
          </h1>
        </div>
        <div
          data-name="Margin"
          data-node-id="37:4687"
          className="relative w-full max-w-[480px] shrink-0 pt-2"
        >
          <div data-name="Container" data-node-id="37:4688" className="flex w-full max-w-[480px] flex-col items-start">
            <p
              className="m-0 w-full font-sans text-[13px] font-normal leading-[20.8px] text-[#8a8a93]"
              data-node-id="37:4689"
            >
              全球动态追踪与智能情报流。
            </p>
          </div>
        </div>
      </div>
      {/* 37:4690：总高 64px（含稿面 pt-24 顶距），与 Title 同高 */}
      <div
        data-name="HorizontalBorder"
        data-node-id="37:4690"
        className="box-border flex h-[64px] max-h-[64px] min-h-[64px] w-full shrink-0 flex-col overflow-hidden pt-[24px]"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto">
          <StatsCards {...stats} />
        </div>
      </div>
    </header>
  );
}
