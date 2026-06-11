/**
 * 顶栏内联 SVG：统一 24×24、stroke 1.5、圆角端点，风格与线宽一致；仙女棒保留品牌金色填充。
 */

const stroke = {
  stroke: "currentColor" as const,
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none" as const,
};

export function TopBarBookmarkGlyph(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"
        {...stroke}
      />
    </svg>
  );
}

/** 线框齿轮（与收藏/侧栏/人像同为描边体系） */
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
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.632 6.632 0 010 .255c-.007.378.138.75.43.99l1.005.828a1.125 1.125 0 01-.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.37.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.593c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
        {...stroke}
      />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" {...stroke} />
    </svg>
  );
}

export function TopBarProfileGlyph(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="12" cy="9" r="3.5" {...stroke} />
      <path d="M5.5 19.25c.9-2.35 3.2-4.25 6.5-4.25s5.6 1.9 6.5 4.25" {...stroke} />
    </svg>
  );
}

/** 侧栏布局：圆角框 + 左竖线 */
export function TopBarPanelLeftGlyph(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="4" y="5" width="16" height="14" rx="2" {...stroke} />
      <path d="M9.5 7.25V16.75" {...stroke} />
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
