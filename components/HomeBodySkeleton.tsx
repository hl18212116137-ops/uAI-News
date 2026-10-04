import SiteHeader from "./SiteHeader";
import { MAIN_FRAME_GRID_SHELL_CLASS, MAIN_GRID_COLS_NO_ANALYSIS } from "@/lib/main-layout-classes";

/** Match the loaded feed geometry, including its collapsed sidebar and header. */
export default function HomeBodySkeleton() {
  return (
    <div className={`${MAIN_FRAME_GRID_SHELL_CLASS} ${MAIN_GRID_COLS_NO_ANALYSIS}`} aria-busy="true" aria-label="正在加载资讯">
      <div className="hidden lg:block" aria-hidden />
      <div className="hidden lg:block" aria-hidden />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 pb-5 sm:px-6 lg:px-8 lg:pb-6">
        <div className="pt-5 lg:pt-6">
          <SiteHeader stats={{ sourceCount: 0, recentPosts: 0 }} unavailable />
        </div>
        <div className="h-10 shrink-0" aria-hidden />
        <div className="app-divider-border-b flex h-[46px] shrink-0 items-center gap-6 overflow-hidden" aria-hidden>
          {Array.from({ length: 8 }, (_, index) => <div key={index} className="skeleton h-4 w-8 shrink-0 rounded" />)}
        </div>
        <div className="space-y-4 pt-6" aria-hidden>
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton h-40 rounded-md" />)}
        </div>
      </div>
      <div className="hidden lg:block" aria-hidden />
      <div className="hidden lg:block" aria-hidden />
    </div>
  );
}
