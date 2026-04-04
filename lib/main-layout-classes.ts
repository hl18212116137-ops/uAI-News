/**
 * Figma MAIN 37:4551 — 稿为横向 flex；实现用 grid 同宽分配，避免 flex 溢出时中栏叠在侧栏上导致无法点击。
 */

/** 与主区一致，顶栏用同一列定义才能与 256/336 absolute 侧栏对齐（固定 pl/pr 仅在单一画板宽成立） */
export const MAIN_GRID_COLS_CLASS =
  "grid-cols-[minmax(0,1fr)_1px_800px_1px_minmax(0,1fr)]";

/**
 * 左列至少容纳 256px SOURCES；避免 minmax(0,1fr) 在窄视口下变为 0 宽导致侧栏被裁切、点击穿透到中栏。
 */
export const MAIN_GRID_COLS_NO_ANALYSIS =
  "grid-cols-[minmax(256px,1fr)_1px_800px_1px_minmax(0,1fr)]";

/**
 * 右栏挂载 ANALYSIS（336 面板）时，末列至少 336px，避免与左栏相同的 0 宽 + absolute 裁切问题。
 */
export const MAIN_GRID_COLS_WITH_ANALYSIS =
  "grid-cols-[minmax(256px,1fr)_1px_800px_1px_minmax(336px,1fr)]";

/** MAIN 网格外壳（不含列模板：由 MainContent 按是否打开分析栏切换） */
export const MAIN_FRAME_GRID_SHELL_CLASS =
  "relative isolate grid min-h-0 w-full min-w-0 flex-1 grid-rows-[minmax(0,1fr)] bg-white";

/** @deprecated 使用 MAIN_FRAME_GRID_SHELL_CLASS + MAIN_GRID_COLS_* 组合 */
export const MAIN_FRAME_CLASS = `${MAIN_FRAME_GRID_SHELL_CLASS} ${MAIN_GRID_COLS_CLASS}`;

/** 43:4890 / 43:4891 — 侧栏格：相对定位 + 裁切，供内层 absolute 256/336 */
export const MAIN_SIDE_FRAME_CLASS =
  "relative min-h-0 min-w-0 h-full overflow-hidden bg-white";

/** 37:4808 — 与侧栏折叠同步 opacity */
export const VERTICAL_DIVIDER_AFTER_SOURCES_CLASS =
  "h-full w-px bg-[#eaecef] transition-opacity layout-transition-surface";

/** 37:4682 */
export const VERTICAL_DIVIDER_BEFORE_ANALYSIS_CLASS =
  "h-full w-px bg-[#f0f0f2] transition-opacity layout-transition-surface";
