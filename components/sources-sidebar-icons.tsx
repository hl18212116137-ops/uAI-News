/**
 * SOURCES 侧栏 Figma 图标内联 SVG，避免首屏对 /icons/sources-*.svg 的瀑布请求。
 */

import type { SVGProps } from "react";

export function SourcesSearchGlyph(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="5.75" cy="5.75" r="3.9" stroke="currentColor" strokeWidth="1.35" />
      <path stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" d="m9.2 9.2 3.55 3.55" />
    </svg>
  );
}

export function SourcesBloggersGlyph(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="7" cy="4.25" r="2.1" stroke="currentColor" strokeWidth="1.2" />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.2"
        d="M2.6 12.1c.65-1.85 2.35-3.1 4.4-3.1s3.75 1.25 4.4 3.1"
      />
    </svg>
  );
}

export function SourcesMediaGlyph(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 15 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="1.25" y="2.5" width="12.5" height="9" rx="1.25" stroke="currentColor" strokeWidth="1.2" />
      <path fill="currentColor" d="M6 5.75 9.25 7.5 6 9.25V5.75Z" />
    </svg>
  );
}

export function SourcesAcademiaGlyph(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 16 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path fill="currentColor" d="M8 .75 15.25 4.25 8 7.75.75 4.25 8 .75Z" />
      <path
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.15"
        d="M1.25 5.5V11c0 .55.45 1 1 1h11.5c.55 0 1-.45 1-1V5.5"
      />
    </svg>
  );
}

export function SourcesRecommendGlyph(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 16 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        fill="currentColor"
        d="m8 1.2 1.55 4.75h5l-4.05 2.95 1.55 4.75L8 10.7l-4.05 2.95 1.55-4.75-4.05-2.95h5L8 1.2Z"
      />
    </svg>
  );
}

export function SourcesChevronRightGlyph(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 6 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
        d="m1.25 1.25 3.5 3.5-3.5 3.5"
      />
    </svg>
  );
}

/** 标题栏「添加信息源」、推荐卡片「关注」— 默认主题蓝 #0055FF（与 Fetch / 链接一致） */
export function SourcesActionPlusGlyph({ className, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={["text-[#0055FF]", className].filter(Boolean).join(" ")}
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
      aria-hidden
    >
      <path d="M6 2.25v7.5M2.25 6h7.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

export function SourcesActionRefreshGlyph({ className, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
      aria-hidden
    >
      <path
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}
