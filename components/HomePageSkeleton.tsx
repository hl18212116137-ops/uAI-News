import HomeBodySkeleton from "./HomeBodySkeleton";

/** Same 56px top bar and content grid as the streaming home shell. */
export default function HomePageSkeleton() {
  return (
    <div className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-white" aria-busy="true">
      <div className="app-divider-border-b h-[57px] shrink-0" aria-hidden />
      <HomeBodySkeleton />
    </div>
  );
}
