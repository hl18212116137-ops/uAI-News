"use client";

import type { User } from "@supabase/supabase-js";
import TopBar from "@/components/TopBar";
import { HomeLayoutProvider, useOptionalHomeLayout } from "@/components/HomeLayoutContext";

function HomePageShellInner({
  user,
  children,
}: {
  user: User | null;
  children: React.ReactNode;
}) {
  const layout = useOptionalHomeLayout();
  if (!layout) return <>{children}</>;

  return (
    <div
      data-name="Body"
      data-node-id="3:2330"
      className="relative flex h-screen min-h-0 w-full min-w-0 flex-col items-stretch overflow-x-auto overflow-y-hidden bg-white"
    >
      <TopBar
        user={user}
        isSourcesListCollapsed={layout.isSourcesListCollapsed}
        onToggleSourcesListCollapsed={layout.toggleSourcesListCollapsed}
        analysisPanelOpen={layout.analysisPanelOpen}
        onCollapseAnalysisSidebar={() => layout.onCollapseAnalysisRef.current?.()}
      />

      <div className="w-full shrink-0 pt-14">
        <div
          data-name="Horizontal Divider"
          data-node-id="3:2694"
          className="h-px w-full bg-[#ebebef]"
          aria-hidden
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/**
 * 首页外壳：顶栏 + 分隔线 + Suspense 槽位。feed 在子树内异步，避免顶栏被 DB 阻塞。
 */
export default function HomePageShell({
  user,
  children,
}: {
  user: User | null;
  children: React.ReactNode;
}) {
  return (
    <HomeLayoutProvider>
      <HomePageShellInner user={user}>{children}</HomePageShellInner>
    </HomeLayoutProvider>
  );
}
