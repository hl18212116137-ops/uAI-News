"use client";

import Link from "next/link";
import { useEffect, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import UserMenu from "@/components/UserMenu";
import {
  TopBarBookmarkGlyph,
  TopBarInsightSparkleGlyph,
  TopBarProfileGlyph,
  TopBarSettingsGlyph,
} from "@/components/top-bar-icons";

type TopBarProps = {
  user: User | null;
  isSourcesListCollapsed: boolean;
  onToggleSourcesListCollapsed: () => void;
  /** 右栏 ANALYSIS 实际可见（非仅选中） */
  analysisPanelOpen?: boolean;
  /** 点击仙女棒：折叠右侧 ANALYSIS（保留列表选中态） */
  onCollapseAnalysisSidebar?: () => void;
};

const layoutTf = "var(--layout-duration) var(--layout-ease)";

/**
 * 单一 DOM：图标不随布局切换卸载；用 left/right + transition 对齐 grid（1fr|1|800|1|1fr）几何。
 * 侧栏折叠时左右控件收拢到中栏 800px 内外沿（与主内容 px-8 对齐的 8px inset）。
 * ANALYSIS 展开时右簇从中栏右锚点（translate -100%）滑向 336px 条（left + transform 过渡）。
 * 动效与 globals.css --layout-duration / --layout-ease 一致（Linear 风格 + reduced-motion 降级）。
 */
export default function TopBar({
  user,
  isSourcesListCollapsed,
  onToggleSourcesListCollapsed,
  analysisPanelOpen = false,
  onCollapseAnalysisSidebar,
}: TopBarProps) {
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.prefetch("/login");
      router.prefetch("/register");
    }
  }, [user, router]);

  const dualCollapsed = isSourcesListCollapsed && !analysisPanelOpen;

  const col1W = "calc((100% - 802px) / 2)";
  const analysisStripLeft = `calc(${col1W} + 802px)`;
  /** 中栏 800px 内沿 + 8px，与 MainContent 主列 padding 对齐 */
  const centerBarEdgeInset = `calc(${col1W} + 1px + 8px)`;
  /** 中栏右内沿（8px），右簇收起态锚点：translate(-100%,-50%) 使图标贴齐该边 */
  const centerBarRightAnchor = `calc(${col1W} + 1px + 800px - 8px)`;

  /** SOURCES 折叠：收拢到中栏左内沿；展开：贴左栏。dualCollapsed 仅用于 Figma node-id。 */
  const layoutTransition = `left ${layoutTf}, right ${layoutTf}, width ${layoutTf}, opacity ${layoutTf}`;
  const rightToolbarTransition = `left ${layoutTf}, width ${layoutTf}, transform ${layoutTf}, opacity ${layoutTf}`;
  const leftToggleStyle: CSSProperties = {
    top: "50%",
    transform: "translateY(-50%)",
    transition: layoutTransition,
    ...(isSourcesListCollapsed
      ? { left: centerBarEdgeInset, right: "auto" }
      : { left: `calc(${col1W} - 256px + 8px)`, right: "auto" }),
  };

  const rightClusterStyle: CSSProperties = {
    top: "50%",
    transition: rightToolbarTransition,
    opacity: analysisPanelOpen ? 1 : 0.98,
    right: "auto",
    ...(analysisPanelOpen
      ? {
          left: analysisStripLeft,
          width: "336px",
          transform: "translate(0, -50%)",
        }
      : {
          left: centerBarRightAnchor,
          width: "max-content",
          transform: "translate(-100%, -50%)",
        }),
  };

  return (
    <header
      data-name="Header"
      data-node-id="3:2668"
      className="fixed left-0 right-0 top-0 z-50 h-[56px] w-full min-w-0 shrink-0 bg-white"
    >
      <div className="relative h-full w-full min-w-0">
        {/* 左侧折叠按钮：单实例，随状态平移 */}
        <button
          type="button"
          data-name="Container"
          data-node-id={dualCollapsed ? "43:5029" : "3:2671"}
          className={[
            "motion-layout-ease absolute z-20 flex h-[53px] w-9 shrink-0 items-center justify-center transition-colors hover:bg-[#f5f5f5]",
            isSourcesListCollapsed ? "text-[#6a7282]" : "text-[#0055FF]",
          ].join(" ")}
          style={leftToggleStyle}
          aria-label={isSourcesListCollapsed ? "展开信息源列表" : "折叠信息源列表"}
          aria-expanded={!isSourcesListCollapsed}
          onClick={onToggleSourcesListCollapsed}
        >
          <svg
            className="size-[15.801px] shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
            data-name="Container"
            data-node-id={dualCollapsed ? "43:5030" : "3:2672"}
          >
            <rect x="2" y="2.5" width="4.5" height="11" rx="0.5" stroke="currentColor" strokeWidth="1.25" />
            <rect x="9.5" y="2.5" width="4.5" height="11" rx="0.5" stroke="currentColor" strokeWidth="1.25" />
          </svg>
        </button>

        {/* 右侧工具条：Figma 3:2668 — ANALYSIS 开时为 336 宽条内 justify-end + gap-8 + px-8；收起时靠中栏右内沿 */}
        <div
          className={`absolute z-20 flex h-[53px] min-w-0 items-center overflow-visible ${analysisPanelOpen ? "justify-end gap-2 px-2" : "justify-end gap-2 px-2"}`}
          style={rightClusterStyle}
        >
          <Link
            href="/bookmarks"
            data-name="Container"
            data-node-id={dualCollapsed ? "43:5033" : "3:2680"}
            className={`motion-layout-ease relative flex shrink-0 items-center justify-center text-[#111113] transition-colors hover:bg-[#f5f5f5] ${analysisPanelOpen ? "h-full min-h-[54px] w-9" : "h-[54px] w-9"}`}
            aria-label="Bookmarks"
          >
            <div
              data-name="Container"
              data-node-id={dualCollapsed ? "43:5034" : "3:2681"}
              className="relative h-[16.001px] w-[12.467px] shrink-0 text-[#111113]"
            >
              <TopBarBookmarkGlyph className="absolute inset-0 block size-full max-w-none" />
            </div>
          </Link>

          <button
            type="button"
            data-name="Container"
            data-node-id={dualCollapsed ? "43:5036" : "3:2683"}
            aria-label="Settings"
            className="motion-layout-ease relative flex size-9 shrink-0 items-center justify-center rounded-md text-[#111113] transition-colors hover:bg-[#f5f5f5]"
          >
            <div
              data-name="Container"
              data-node-id={dualCollapsed ? "43:5037" : "3:2684"}
              className="relative h-[17.467px] w-[17.786px] shrink-0 text-[#111113]"
            >
              <TopBarSettingsGlyph className="absolute inset-0 block size-full max-w-none" />
            </div>
          </button>

          {user ? (
            <UserMenu
              user={user}
              variant="toolbar"
              toolbarOuterNodeId={dualCollapsed ? "43:5039" : "3:2686"}
              toolbarInnerNodeId={dualCollapsed ? "43:5040" : "3:2687"}
            />
          ) : (
            <div
              data-name="Container"
              data-node-id={dualCollapsed ? "43:5039" : "3:2686"}
              className="relative flex size-9 shrink-0 items-center justify-center rounded-md text-[#111113]"
            >
              <Link
                href="/login"
                className="motion-layout-ease flex size-9 items-center justify-center rounded-md transition-colors hover:bg-[#f5f5f5]"
                aria-label="Login"
              >
                <div
                  data-name="Container"
                  data-node-id={dualCollapsed ? "43:5040" : "3:2687"}
                  className="relative size-[17.467px] shrink-0 text-[#111113]"
                >
                  <TopBarProfileGlyph className="absolute inset-0 block size-full max-w-none" />
                </div>
              </Link>
            </div>
          )}

          {/* 折叠侧栏时移出 flex 流，避免 justify-end 顺序错乱；展开时参与 justify-between（5 子项） */}
          <div
            data-name="Margin"
            data-node-id="3:2689"
            className={
              analysisPanelOpen
                ? "relative flex h-6 w-[33px] shrink-0 flex-col items-center justify-center px-4"
                : "pointer-events-none absolute left-0 top-0 h-0 w-0 overflow-hidden opacity-0"
            }
            aria-hidden={!analysisPanelOpen}
          >
            <div
              data-name="Vertical Divider"
              data-node-id="3:2690"
              className="h-6 w-px shrink-0 bg-[#e5e7eb] opacity-70"
              aria-hidden
            />
          </div>

          <button
            type="button"
            data-name="Container"
            data-node-id="3:2691"
            className={
              analysisPanelOpen
                ? "motion-layout-ease relative flex h-[54px] w-9 shrink-0 items-center justify-center transition-colors hover:bg-[rgba(255,178,36,0.08)]"
                : "pointer-events-none absolute left-0 top-0 h-0 w-0 overflow-hidden opacity-0"
            }
            aria-label="折叠分析侧栏"
            aria-hidden={!analysisPanelOpen}
            tabIndex={analysisPanelOpen ? 0 : -1}
            onClick={() => analysisPanelOpen && onCollapseAnalysisSidebar?.()}
          >
            <div data-name="Container" data-node-id="3:2692" className="relative h-[19.016px] w-[19.063px] shrink-0">
              <TopBarInsightSparkleGlyph className="absolute inset-0 block size-full max-w-none" />
            </div>
          </button>
        </div>
      </div>
    </header>
  );
}
