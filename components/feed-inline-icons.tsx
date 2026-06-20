/**
 * 主列 Tab / 卡片用 Figma 图标内联，避免 /icons/feed-*.svg 额外请求。
 */

export function FeedFetchGlyph(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

export function FeedInsightSparkleGlyph(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        fill="#ffb224"
        d="M12 1.5l1.4 7.1L20.5 12l-7.1 1.4L12 20.5l-1.4-7.1L3.5 12l7.1-1.4L12 1.5Zm6 12 .9 3.1 3.1.9-3.1.9L18 21.5l-.9-3.1-3.1-.9 3.1-.9.9-3.1Z"
      />
    </svg>
  );
}

export function FeedLongformGlyph(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
    >
      <path
        d="M6.75 4.25h7.35l3.15 3.15v12.35H6.75V4.25Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 4.75V8.5h3.75M9.6 12h4.9M9.6 15h4.9M9.6 18h2.9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
