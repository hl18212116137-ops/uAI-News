import StatsCards from './StatsCards';
import StatusIndicator from './StatusIndicator';

type SiteHeaderProps = {
  stats: {
    bloggerCount: number;
    mediaCount: number;
    academicCount: number;
    totalPosts: number;
    todayPosts: number;
  };
  onRefresh: () => void;
  isRunning: boolean;
  onAddSource?: (type: 'blogger' | 'media' | 'academic') => void;
};

export default function SiteHeader({ stats, onRefresh, isRunning, onAddSource }: SiteHeaderProps) {
  return (
    <div className="mt-[70px] pt-10 pb-8 text-center bg-white">
      <h1 className="text-[72px] font-bold mb-5 text-[#101828] leading-none">
        uAI 周报
      </h1>
      <p className="text-base text-[#6a7282] mb-20">
        定制信源，实时抓取，生成独属于你的 AI 周报。
      </p>
      <StatsCards {...stats} onAddSource={onAddSource} />
      <StatusIndicator onRefresh={onRefresh} isRunning={isRunning} />
    </div>
  );
}
