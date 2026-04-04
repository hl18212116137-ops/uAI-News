/**
 * 顶栏 Figma 图标内联 SVG，避免首屏对 /icons/*.svg 的串行请求，图标与 HTML 同步到达。
 * 颜色随父级 `text-*` / `currentColor`（仙女棒保持品牌金色）。
 */

export function TopBarBookmarkGlyph(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 13 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M0 1.67C0 1.21.16.82.49.49.82.16 1.21 0 1.67 0h9.33c.46 0 .85.16 1.18.49.33.33.49.72.49 1.18V16l-5.83-2.5L0 16V1.67Z"
      />
    </svg>
  );
}

export function TopBarSettingsGlyph(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.47.35l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.455.455 0 0 0-.59.22L2.74 8.87c-.12.22-.08.5.12.61l2.03 1.58c-.04.31-.07.63-.07.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.27.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.5-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
      />
    </svg>
  );
}

export function TopBarProfileGlyph(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="9" cy="6" r="3.25" stroke="currentColor" strokeWidth="1.35" />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.35"
        d="M3.25 15.2c.9-2.35 3.05-3.95 5.75-3.95s4.85 1.6 5.75 3.95"
      />
    </svg>
  );
}

export function TopBarInsightSparkleGlyph(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fill="#ffb224"
        d="M12 1.5l1.4 7.1L20.5 12l-7.1 1.4L12 20.5l-1.4-7.1L3.5 12l7.1-1.4L12 1.5Zm6 12 .9 3.1 3.1.9-3.1.9L18 21.5l-.9-3.1-3.1-.9 3.1-.9.9-3.1Z"
      />
    </svg>
  );
}
