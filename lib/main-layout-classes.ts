/**
 * Figma MAIN 37:4551 — 稿为横向 flex；实现用 grid 同宽分配，避免 flex 溢出时中栏叠在侧栏上导致无法点击。
 */

/** 与主区一致，顶栏用同一列定义才能与 256/336 absolute 侧栏对齐（固定 pl/pr 仅在单一画板宽成立） */
export const MAIN_GRID_COLS_CLASS =
  "lg:grid-cols-[minmax(0,1fr)_1px_800px_1px_minmax(0,1fr)]";

/**
 * 左列至少容纳 256px SOURCES；避免 minmax(0,1fr) 在窄视口下变为 0 宽导致侧栏被裁切、点击穿透到中栏。
 */
export const MAIN_GRID_COLS_NO_ANALYSIS =
  "lg:grid-cols-[minmax(256px,1fr)_1px_800px_1px_minmax(0,1fr)]";

/**
 * 右栏挂载 ANALYSIS（336 面板）时，末列至少 336px，避免与左栏相同的 0 宽 + absolute 裁切问题。
 */
export const MAIN_GRID_COLS_WITH_ANALYSIS =
  "lg:grid-cols-[minmax(256px,1fr)_1px_800px_1px_minmax(336px,1fr)]";

/**
 * MAIN 外壳：窄屏为 flex 单栏（主列占满）；lg+ 为 grid。
 * 侧栏在 max-lg 下由 MainContent 内 fixed 抽屉呈现，不占文档流。
 */
export const MAIN_FRAME_GRID_SHELL_CLASS =
  "relative isolate flex min-h-0 w-full min-w-0 flex-1 flex-col bg-white lg:grid lg:grid-rows-[minmax(0,1fr)]";

/** @deprecated 使用 MAIN_FRAME_GRID_SHELL_CLASS + MAIN_GRID_COLS_* 组合 */
export const MAIN_FRAME_CLASS = `${MAIN_FRAME_GRID_SHELL_CLASS} ${MAIN_GRID_COLS_CLASS}`;

/** 43:4890 / 43:4891 — 侧栏格：相对定位 + 裁切，供内层 absolute 256/336 */
export const MAIN_SIDE_FRAME_CLASS =
  "relative min-h-0 min-w-0 h-full overflow-hidden bg-white";

/** 37:4808 — 与侧栏折叠同步 opacity；窄屏无栅格竖线 */
export const VERTICAL_DIVIDER_AFTER_SOURCES_CLASS =
  "app-divider-v hidden h-full transition-opacity layout-transition-surface lg:block";

/** 37:4682 */
export const VERTICAL_DIVIDER_BEFORE_ANALYSIS_CLASS =
  "app-divider-v hidden h-full transition-opacity layout-transition-surface lg:block";
