/**
 * INSIGHT 侧栏三模块标题左侧实心图标（主题金由外层 text / currentColor 控制）。
 */

/** 原文：实心折角稿纸 */
export function InsightOriginalGlyph(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        fill="currentColor"
        d="M2.5 1.5h6L12 4.5v8H2.5v-11zm6 0v3h3L8.5 1.5z"
      />
    </svg>
  );
}

/** 要点：圆点 + 横条列表 */
export function InsightKeyPointsGlyph(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="3.35" cy="3.5" r="1.15" fill="currentColor" />
      <rect x="5.45" y="2.78" width="6.4" height="1.45" rx="0.72" fill="currentColor" />
      <circle cx="3.35" cy="7" r="1.15" fill="currentColor" />
      <rect x="5.45" y="6.28" width="6.4" height="1.45" rx="0.72" fill="currentColor" />
      <circle cx="3.35" cy="10.5" r="1.15" fill="currentColor" />
      <rect x="5.45" y="9.78" width="4.85" height="1.45" rx="0.72" fill="currentColor" />
    </svg>
  );
}

/** 关联：双节点 + 连接条 */
export function InsightRelevanceGlyph(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="3.35" cy="7" r="1.9" fill="currentColor" />
      <rect x="5.35" y="6.12" width="3.3" height="1.76" rx="0.88" fill="currentColor" />
      <circle cx="10.65" cy="7" r="1.9" fill="currentColor" />
    </svg>
  );
}
