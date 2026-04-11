"use client";

import Image from "next/image";
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { NewsItem } from "@/lib/types";
import {
  filterInsightReviewEcho,
  sanitizeInsightContextEcho,
} from "@/lib/insight-echo-guard";
import { isMostlyChinese } from "@/lib/text-locale";
import {
  emphasizeOriginalInsightKeyPhrases,
  formatOriginalInsightBody,
  formatTypography,
} from "@/lib/utils";
import { BoldLinkifiedInline } from "@/components/LinkifiedParagraph";
import SourceAvatarImg from "@/components/SourceAvatarImg";
import {
  InsightKeyPointsGlyph,
  InsightOriginalGlyph,
  InsightRelevanceGlyph,
} from "@/components/insight-section-icons";
import { SourcesChevronRightGlyph } from "@/components/sources-sidebar-icons";

/** ORIGINAL 正文默认折叠高度（px），超出则显示展开 */
const ORIGINAL_COLLAPSED_MAX_PX = 220;

/**
 * INSIGHT 侧栏三模块正文：13px / leading-[21px]；ORIGINAL 略浅，分析块近黑。
 */
const INSIGHT_BODY_TYPE =
  "font-sans text-[13px] font-normal leading-[21px] tracking-[-0.01em] antialiased whitespace-pre-wrap break-words";
const INSIGHT_ORIGINAL_BODY_TEXT = `${INSIGHT_BODY_TYPE} text-[#6a7282]`;
const INSIGHT_ANALYSIS_BODY_TEXT = `${INSIGHT_BODY_TYPE} text-[#111113]`;
const INSIGHT_ANALYSIS_BOLD = "font-semibold text-[#111113]";
const INSIGHT_BODY_MUTED = `${INSIGHT_BODY_TYPE} text-[#99a1af]`;

type AnalysisData = {
  scores?: number | null;
  reliability?: number | null;
  review?: string | string[] | null;
  contextMatch?: string | null;
  originalTranslation?: string | null;
  originalTranslationReferenced?: string | null;
};

type AnalysisPanelProps = {
  post: NewsItem | null;
  analysis?: AnalysisData | null;
  isLoading?: boolean;
  /** 当前帖 INSIGHT 请求失败时的说明（非空时展示错误条与重试） */
  analysisError?: string | null;
  onRetryAnalysis?: () => void;
  onClose?: () => void;
  isOpen?: boolean;
};

function normalizeScorePercent(n: number | null | undefined): number | null {
  if (n == null || Number.isNaN(n)) return null;
  return Math.round(Math.min(100, Math.max(0, n)));
}

function scoreMetaLabel(pct: number | null): string {
  if (pct == null) return "";
  if (pct >= 80) return "高优先级";
  if (pct >= 50) return "值得关注";
  return "一般关注";
}

type PrimaryOriginalState =
  | { kind: "text"; text: string }
  | { kind: "loading" }
  | { kind: "empty" };

/**
 * 原文区以中文为主：优先 INSIGHT 的 originalTranslation（多为中文），再认库内已是中文的 originalText；
 * 库内仍为英文时，在分析加载中显示「生成中文…」而非先晒英文；仅无译文且非加载时才回落英文。
 */
function resolvePrimaryOriginalDisplay(
  rawBody: string,
  translation: string,
  isLoading: boolean,
): PrimaryOriginalState {
  const raw = rawBody.trim();
  const tr = translation.trim();

  if (tr.length > 0 && isMostlyChinese(tr)) {
    return { kind: "text", text: tr };
  }
  if (raw.length > 0 && isMostlyChinese(rawBody)) {
    return { kind: "text", text: rawBody };
  }
  if (tr.length > 0) {
    return { kind: "text", text: tr };
  }
  if (isLoading && raw.length > 0 && !isMostlyChinese(rawBody)) {
    return { kind: "loading" };
  }
  if (raw.length > 0) {
    return { kind: "text", text: rawBody };
  }
  if (isLoading) {
    return { kind: "loading" };
  }
  return { kind: "empty" };
}

function normalizeInsightWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * 主段落已是 INSIGHT 译文或与译文一致时不再叠「中文译文」；
 * 主段落为中文库文且另有不同译文时可追加（少见）。
 */
function shouldShowChineseTranslationBelow(
  primaryShown: string,
  translation: string,
  rawBody: string,
): boolean {
  const t = translation.trim();
  if (!t) return false;
  if (normalizeInsightWhitespace(t) === normalizeInsightWhitespace(primaryShown.trim())) {
    return false;
  }
  const raw = rawBody.trim();
  if (
    raw.length > 0 &&
    isMostlyChinese(rawBody) &&
    isMostlyChinese(t) &&
    normalizeInsightWhitespace(t) !== normalizeInsightWhitespace(raw)
  ) {
    return true;
  }
  return false;
}

/** ORIGINAL 主段落：入库原文立即可见；AI 返回中文译文时可追加一块（KEY POINTS / RELEVANCE 仍依赖 analysis） */
function OriginalPrimaryAndTranslation({
  rawBody,
  translation,
  isLoading,
  paragraphClassName,
  mutedClassName,
  linkClassName,
  emptyLabel,
}: {
  rawBody: string;
  translation: string;
  isLoading: boolean;
  paragraphClassName: string;
  mutedClassName: string;
  linkClassName: string;
  emptyLabel: string;
}) {
  const primary = resolvePrimaryOriginalDisplay(rawBody, translation, isLoading);
  return (
    <>
      {primary.kind === "text" ? (
        <>
          <OriginalInsightBodyParagraph
            rawText={primary.text}
            paragraphClassName={paragraphClassName}
            linkClassName={linkClassName}
          />
          {shouldShowChineseTranslationBelow(primary.text, translation, rawBody) ? (
            <div className="app-divider-border-t mt-3 pt-3">
              <p className="m-0 mb-2 font-mono text-[9px] font-medium uppercase leading-none tracking-[0.12em] text-[#99a1af]">
                中文译文
              </p>
              <OriginalInsightBodyParagraph
                rawText={translation.trim()}
                paragraphClassName={paragraphClassName}
                linkClassName={linkClassName}
              />
            </div>
          ) : null}
        </>
      ) : primary.kind === "loading" ? (
        <p className={mutedClassName}>生成中文内容中…</p>
      ) : (
        <p className={mutedClassName}>{emptyLabel}</p>
      )}
    </>
  );
}

/** ORIGINAL：可点链接 + 书名《》、短引「」、编辑注【】等少量加粗（全文合计有上限，见 `emphasizeOriginalInsightKeyPhrases`） */
function OriginalInsightBodyParagraph({
  rawText,
  paragraphClassName,
  linkClassName,
}: {
  rawText: string;
  paragraphClassName: string;
  linkClassName: string;
}) {
  const text = emphasizeOriginalInsightKeyPhrases(formatOriginalInsightBody(rawText));
  return (
    <p className={paragraphClassName}>
      <BoldLinkifiedInline
        text={text}
        linkClassName={linkClassName}
        boldClassName="font-semibold text-[#52525b]"
      />
    </p>
  );
}

function OriginalMediaGallery({
  urls,
  imageWrapClass = "",
  tweetHref,
  videoLinkClassName,
}: {
  urls: string[];
  imageWrapClass?: string;
  /** 原推文（或嵌套推文）在 X 上的链接，视频仅展示标题并指向此 URL */
  tweetHref: string;
  videoLinkClassName: string;
}) {
  const list = urls.filter((u) => typeof u === "string" && /^https:\/\//i.test(u));
  if (list.length === 0) return null;
  const href = tweetHref.trim() && /^https:\/\//i.test(tweetHref) ? tweetHref : "";
  const videoCount = list.filter((u) => isVideoMediaUrl(u)).length;
  return (
    <div className="mt-5 flex flex-col gap-4">
      {list.map((u, idx) =>
        isVideoMediaUrl(u) ? (
          <div key={u} className="flex flex-col gap-1">
            <p className="m-0 font-sans text-[13px] font-medium leading-[21px] tracking-[-0.01em] antialiased text-[#6a7282]">
              推文视频
              {videoCount > 1
                ? `（${list.slice(0, idx + 1).filter((x) => isVideoMediaUrl(x)).length}/${videoCount}）`
                : null}
            </p>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={videoLinkClassName}
              >
                在 X 打开原推文查看视频
              </a>
            ) : (
              <span className="font-sans text-[13px] leading-[21px] text-[#99a1af]">暂无原推文链接</span>
            )}
          </div>
        ) : (
          <div
            key={u}
            className={`relative flex min-h-[120px] w-full max-w-full justify-center overflow-hidden rounded-lg border border-[#e5e7eb] bg-[#fafafa] shadow-xs ${imageWrapClass}`}
          >
            <Image
              src={u}
              alt=""
              width={800}
              height={800}
              className="max-h-[280px] w-auto max-w-full object-contain"
              sizes="(max-width: 400px) 85vw, 288px"
            />
          </div>
        )
      )}
    </div>
  );
}

/** X 侧栏附件：video.twimg / .mp4 / m3u8 用原生 video，其余走图片。 */
function isVideoMediaUrl(url: string): boolean {
  const u = url.toLowerCase();
  if (u.includes("video.twimg.com")) return true;
  if (u.includes(".m3u8")) return true;
  if (/\.mp4(\?|#|$)/i.test(u)) return true;
  return false;
}

/** INSIGHT 模块标题左侧图标：原文稿、要点列表、关联脉络；主题金由 `!text-[#FFB224]` 驱动 currentColor。 */
const INSIGHT_SECTION_ICON_GLYPH_CLASS =
  "absolute inset-0 block size-full max-w-none !text-[#FFB224]";

function InsightSectionTitleIcon({ section }: { section: "original" | "keyPoints" | "relevance" }) {
  if (section === "original") {
    return (
      <span className="relative size-[13px] shrink-0 !text-[#FFB224]" aria-hidden>
        <InsightOriginalGlyph className={INSIGHT_SECTION_ICON_GLYPH_CLASS} />
      </span>
    );
  }
  if (section === "keyPoints") {
    return (
      <span className="relative size-[13px] shrink-0 !text-[#FFB224]" aria-hidden>
        <InsightKeyPointsGlyph className={INSIGHT_SECTION_ICON_GLYPH_CLASS} />
      </span>
    );
  }
  return (
    <span className="relative size-[13px] shrink-0 !text-[#FFB224]" aria-hidden>
      <InsightRelevanceGlyph className={INSIGHT_SECTION_ICON_GLYPH_CLASS} />
    </span>
  );
}

/** POST META：仅头像、作者名、重要度分（无障碍仍带档位说明）。 */
function PostMetaRow({
  post,
  titleHref,
  scoreDisplay,
  scoreLabel,
}: {
  post: NewsItem | null;
  titleHref: string;
  scoreDisplay: string;
  scoreLabel: string;
}) {
  if (!post) {
    return (
      <p className="m-0 font-sans text-[13px] leading-[21px] text-[#99a1af]" aria-live="polite">
        暂无帖子信息
      </p>
    );
  }

  const name = post.source.name || post.source.handle?.replace(/^@/, "") || "未知来源";
  const scoreAria =
    scoreLabel.trim().length > 0
      ? `重要度 ${scoreDisplay} 分，满分 100。${scoreLabel}`
      : `重要度 ${scoreDisplay} 分，满分 100`;

  return (
    <div className="app-divider-border-b flex min-w-0 items-center justify-between gap-4 pb-3" aria-live="polite">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SourceAvatarImg
          src={post.source.avatar}
          alt={name}
          letter={post.source.name || post.source.handle || "?"}
          imgClassName="h-6 w-6 shrink-0 rounded-[3px] object-cover ring-1 ring-[color:var(--app-divider)]"
          placeholderClassName="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] bg-[#fafafa] text-[8px] font-semibold text-[#99a1af] ring-1 ring-[color:var(--app-divider)]"
        />
        <a
          href={titleHref}
          target="_blank"
          rel="noopener noreferrer"
          className="motion-layout-ease min-w-0 flex-1 truncate font-sans text-[13px] font-medium leading-[21px] tracking-[-0.02em] text-[#111113] antialiased transition-opacity duration-200 ease-layout-out hover:opacity-65"
        >
          {formatTypography(name)}
        </a>
      </div>
      <div
        className="flex shrink-0 items-baseline gap-1"
        role="group"
        aria-label={scoreAria}
      >
        <span className="font-mono text-[24px] font-semibold leading-none tracking-[-0.05em] !text-[#FFB224] antialiased tabular-nums">
          {scoreDisplay}
        </span>
        <span className="translate-y-[-1px] font-mono text-[11px] font-normal leading-none text-[#99a1af] tabular-nums">
          /100
        </span>
      </div>
    </div>
  );
}

/** 与 SourcesList 订阅区 BLOGGERS 等标题行同款：`min-h-10 py-2`、`gap-2`、mono 11px bold 蓝字。 */
function SectionHeading({
  icon,
  label,
  id,
  endSlot,
  onHeadingClick,
  headingClickLabel,
  /** 与 onHeadingClick + endSlot 同用：整行 disclosure（如 ORIGINAL） */
  toggleAriaExpanded,
  toggleAriaControls,
}: {
  icon: ReactNode;
  label: string;
  id?: string;
  /** 标题右侧（如 ORIGINAL 与 KP/RELEVANCE 同款的折叠 chevron，勿再包一层 button） */
  endSlot?: ReactNode;
  /** 点击回调；与 endSlot 同时存在时整行合成一个 button，中间空白也可点 */
  onHeadingClick?: () => void;
  /** 有 onHeadingClick 时供无障碍读取的操作说明 */
  headingClickLabel?: string;
  toggleAriaExpanded?: boolean;
  toggleAriaControls?: string;
}) {
  const titleLabel = (
    <span
      id={id}
      className="shrink-0 font-mono text-[11px] font-bold uppercase leading-[16.5px] tracking-[1.1px] text-[#0055FF]"
    >
      {label}
    </span>
  );

  const rowStart = (
    <span className="flex min-w-0 items-center gap-2">
      {icon}
      {titleLabel}
    </span>
  );

  if (onHeadingClick && endSlot) {
    return (
      <button
        type="button"
        onClick={onHeadingClick}
        aria-expanded={toggleAriaExpanded}
        aria-controls={toggleAriaControls}
        aria-label={headingClickLabel}
        className="relative box-border flex min-h-10 w-full min-w-0 shrink-0 cursor-pointer items-center justify-between gap-3 border-0 bg-transparent py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF] focus-visible:ring-offset-1"
      >
        {rowStart}
        <span className="pointer-events-none flex shrink-0 items-center">{endSlot}</span>
      </button>
    );
  }

  const leftBlock = onHeadingClick ? (
    <button
      type="button"
      onClick={onHeadingClick}
      aria-label={headingClickLabel}
      className="flex min-w-0 cursor-pointer items-center border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF] focus-visible:ring-offset-1"
    >
      {rowStart}
    </button>
  ) : (
    <div className="flex min-w-0 items-center">{rowStart}</div>
  );

  if (endSlot) {
    return (
      <div className="relative box-border flex min-h-10 w-full min-w-0 shrink-0 items-center justify-between gap-3 py-2">
        {leftBlock}
        <div className="shrink-0">{endSlot}</div>
      </div>
    );
  }

  return (
    <div className="relative box-border flex min-h-10 w-full min-w-0 shrink-0 items-center py-2">
      {leftBlock}
    </div>
  );
}

/** 与 SourcesList BLOGGERS 等同款：grid 行高折叠 + chevron 旋转 + motion-layout-ease */
function InsightCollapsibleSectionHeading({
  section,
  label,
  headingId,
  controlsId,
  expanded,
  onToggle,
}: {
  section: "keyPoints" | "relevance";
  label: string;
  headingId: string;
  controlsId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controlsId}
      className="box-border flex min-h-10 w-full cursor-pointer items-center justify-between border-0 bg-transparent py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF] focus-visible:ring-offset-1"
    >
      <span className="flex min-w-0 items-center gap-2">
        <InsightSectionTitleIcon section={section} />
        <span
          id={headingId}
          className="shrink-0 font-mono text-[11px] font-bold uppercase leading-[16.5px] tracking-[1.1px] text-[#0055FF]"
        >
          {label}
        </span>
      </span>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#8A8A93]" aria-hidden>
        <span
          className={[
            "motion-layout-ease relative h-[7.223px] w-[4.54px] text-[#8A8A93] transition-transform",
            expanded ? "rotate-90" : "rotate-0",
          ].join(" ")}
        >
          <SourcesChevronRightGlyph className="absolute inset-0 block size-full max-w-none" />
        </span>
      </span>
    </button>
  );
}

/** INSIGHT API 的 review → 编号行 */
function normalizeHighlightLines(review: string | string[] | null | undefined): string[] {
  if (review == null) return [];
  if (Array.isArray(review)) {
    return review.map((s) => String(s).trim()).filter(Boolean);
  }
  const t = String(review).trim();
  if (!t) return [];
  return t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
}

/** 去掉 API 自带的成对引号，避免与装饰性金引号重复且呈黑色正文色。 */
function stripOuterMatchingQuotes(s: string): string {
  const t = s.trim();
  if (t.length < 2) return t;
  const a = t[0];
  const b = t[t.length - 1];
  if (
    (a === '"' && b === '"') ||
    (a === "\u201c" && b === "\u201d") ||
    (a === "'" && b === "'") ||
    (a === "「" && b === "」") ||
    (a === "『" && b === "』")
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/** 要点/启发生成中：旋转刷新图标 + 文案 */
function InsightGeneratingRow({ label, mutedClass }: { label: string; mutedClass: string }) {
  return (
    <span
      className={`inline-flex w-full min-w-0 items-center gap-2 ${mutedClass}`}
      role="status"
      aria-live="polite"
    >
      <svg
        className="size-3.5 shrink-0 animate-spin text-[#99a1af]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      <span>{label}</span>
    </span>
  );
}

/** RELEVANCE：单句启发，无编号 */
function InsightRelevanceSingle({
  text,
  isPending,
  loadingLabel,
  emptyLabel,
}: {
  text: string;
  isPending: boolean;
  loadingLabel: string;
  emptyLabel: string;
}) {
  const mutedClass = `m-0 ${INSIGHT_BODY_MUTED}`;
  const t = stripOuterMatchingQuotes(text);
  if (!t) {
    return (
      <p className={`m-0 box-border block w-full min-w-0 max-w-full self-stretch ${mutedClass}`}>
        {isPending ? <InsightGeneratingRow label={loadingLabel} mutedClass={mutedClass} /> : emptyLabel}
      </p>
    );
  }
  /**
   * 引号定位：此前用三列 grid，第三列宽为 `auto`，右引号贴在列首＝紧贴正文右侧，无法与 INSIGHT 内容区右缘对齐。
   * 改为满宽 `relative` 容器 + 左/右 `absolute`，正文 `pl-5 pr-5` 避让 18px 引号。
   */
  return (
    <div
      className="relative box-border w-full min-w-0 max-w-full self-stretch"
      role="note"
      aria-label="重点点评"
    >
      <span
        className="pointer-events-none absolute left-0 top-px z-0 select-none font-sans text-[18px] font-bold leading-none antialiased text-[#c5cad3]"
        aria-hidden
      >
        &ldquo;
      </span>
      <span
        className="pointer-events-none absolute bottom-px right-0 z-0 select-none font-sans text-[18px] font-bold leading-none antialiased text-[#c5cad3]"
        aria-hidden
      >
        &rdquo;
      </span>
      <p className={`relative z-[1] m-0 min-w-0 w-full max-w-full pl-5 pr-5 ${INSIGHT_ANALYSIS_BODY_TEXT}`}>
        <BoldLinkifiedInline
          className="block min-w-0 w-full max-w-full"
          text={t}
          boldClassName={INSIGHT_ANALYSIS_BOLD}
        />
      </p>
    </div>
  );
}

function InsightNumberedBody({
  items,
  isPending,
  loadingLabel,
  emptyLabel,
}: {
  items: string[];
  isPending: boolean;
  loadingLabel: string;
  emptyLabel: string;
}) {
  const lineClass = `m-0 min-w-0 flex-1 ${INSIGHT_ANALYSIS_BODY_TEXT}`;
  const mutedClass = `m-0 ${INSIGHT_BODY_MUTED}`;

  if (items.length === 0) {
    return (
      <p className={`m-0 w-full min-w-0 ${mutedClass}`}>
        {isPending ? <InsightGeneratingRow label={loadingLabel} mutedClass={mutedClass} /> : emptyLabel}
      </p>
    );
  }

  return (
    <ul className="m-0 flex w-full min-w-0 max-w-full list-none flex-col gap-4 p-0" role="list">
      {items.map((item, i) => (
        <li key={i} className="flex w-full min-w-0 max-w-full gap-1.5" role="listitem">
          <span
            className="w-2 shrink-0 select-none pt-px text-left font-mono text-[13px] font-normal leading-[21px] text-[#99a1af]"
            aria-hidden
          >
            -
          </span>
          <p className={lineClass}>
            <BoldLinkifiedInline text={item} boldClassName={INSIGHT_ANALYSIS_BOLD} />
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function AnalysisPanel({
  post,
  analysis,
  isLoading = false,
  analysisError = null,
  onRetryAnalysis,
  onClose,
  isOpen: _isOpen,
}: AnalysisPanelProps) {
  void _isOpen;

  const scorePct = normalizeScorePercent(
    analysis?.scores ??
      (typeof post?.importanceScore === "number" ? post.importanceScore : null)
  );
  const scoreDisplay = scorePct != null ? String(scorePct) : isLoading ? "…" : "—";
  const scoreLabel = scoreMetaLabel(scorePct);

  const highlightLines = useMemo(() => {
    const raw = normalizeHighlightLines(analysis?.review ?? null).slice(0, 3);
    if (!post) return raw;
    const filtered = filterInsightReviewEcho(post, raw.length > 0 ? raw : null);
    return filtered ?? [];
  }, [post, analysis?.review]);

  const contextText = useMemo(() => {
    const raw = analysis?.contextMatch?.trim() ?? "";
    if (!post) return raw;
    return sanitizeInsightContextEcho(post, raw || null)?.trim() ?? "";
  }, [post, analysis?.contextMatch]);

  /** 要点/启发仅在接口进行中显示「生成中」；echo 过滤后为空时显示「暂无」，由用户点重试（自动清空缓存曾导致反复请求与界面抖动） */
  const keyPointsPending = isLoading;
  const relevancePending = isLoading;

  const originalTranslation = analysis?.originalTranslation?.trim() ?? "";
  const refTranslation = analysis?.originalTranslationReferenced?.trim() ?? "";
  const originalBody = post?.originalText?.trim() ?? "";
  const refPost = post?.referencedPost;
  const refBody = refPost?.text?.trim() ?? "";
  const sourceUrl = post?.source?.url?.trim() ?? "";
  const referencedTweetHref =
    refPost?.id && refPost.userName?.trim()
      ? `https://x.com/${refPost.userName.replace(/^@/, "")}/status/${refPost.id}`
      : sourceUrl;
  const titleHref = sourceUrl || "#";
  const mediaUrls = post?.mediaUrls?.filter((u) => typeof u === "string" && /^https:\/\//i.test(u)) ?? [];

  const originalContentRef = useRef<HTMLDivElement>(null);
  const [originalExpanded, setOriginalExpanded] = useState(false);
  const [originalOverflows, setOriginalOverflows] = useState(false);
  const [keyPointsOpen, setKeyPointsOpen] = useState(true);
  const [relevanceOpen, setRelevanceOpen] = useState(true);

  /** 展开 ORIGINAL 全文且可折叠时：底部两模块正文强制收起，把纵向空间留给原文 */
  const originalFocusMode = originalExpanded && originalOverflows;
  const keyPointsExpanded = originalFocusMode ? false : keyPointsOpen;
  const relevanceExpanded = originalFocusMode ? false : relevanceOpen;
  /** 两块都收起时：KEY POINTS / RELEVANCE 之间用较小 gap；任一块展开时用 gap-4 */
  const insightBottomBothCollapsed = !keyPointsExpanded && !relevanceExpanded;

  useEffect(() => {
    setOriginalExpanded(false);
    setKeyPointsOpen(true);
    setRelevanceOpen(true);
  }, [post?.id]);

  const toggleKeyPointsSection = useCallback(() => {
    if (originalFocusMode) {
      setOriginalExpanded(false);
      setKeyPointsOpen(true);
      return;
    }
    setKeyPointsOpen((o) => {
      if (o) return false;
      setOriginalExpanded(false);
      return true;
    });
  }, [originalFocusMode]);

  const toggleRelevanceSection = useCallback(() => {
    if (originalFocusMode) {
      setOriginalExpanded(false);
      setRelevanceOpen(true);
      return;
    }
    setRelevanceOpen((o) => {
      if (o) return false;
      setOriginalExpanded(false);
      return true;
    });
  }, [originalFocusMode]);

  const handleKeyPointsBodyClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!keyPointsExpanded) return;
      if (typeof window !== "undefined" && window.getSelection()?.toString().trim()) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("a, button, [role='button'], img, video")) return;
      toggleKeyPointsSection();
    },
    [keyPointsExpanded, toggleKeyPointsSection],
  );

  const handleRelevanceBodyClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!relevanceExpanded) return;
      if (typeof window !== "undefined" && window.getSelection()?.toString().trim()) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("a, button, [role='button'], img, video")) return;
      toggleRelevanceSection();
    },
    [relevanceExpanded, toggleRelevanceSection],
  );

  const refMediaLen = refPost?.mediaUrls?.length ?? 0;
  useLayoutEffect(() => {
    if (!post?.id) {
      setOriginalOverflows(false);
      return;
    }
    const measure = () => {
      const node = originalContentRef.current;
      if (!node) return;
      setOriginalOverflows(node.scrollHeight > ORIGINAL_COLLAPSED_MAX_PX);
    };
    measure();
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(measure);
    });
    const node = originalContentRef.current;
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    if (ro && node) ro.observe(node);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [
    post?.id,
    originalBody,
    refBody,
    originalTranslation,
    refTranslation,
    isLoading,
    mediaUrls.length,
    refPost?.kind,
    refMediaLen,
  ]);

  const handleOriginalBodyClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!originalOverflows) return;
      if (typeof window !== "undefined" && window.getSelection()?.toString().trim()) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("a, button, [role='button'], img, video")) return;
      setOriginalExpanded((v) => !v);
    },
    [originalOverflows],
  );

  /** ORIGINAL 正文内链接：不加粗，与 KEY POINTS 等处区分 */
  const linkifiedOriginalClass =
    "break-all font-normal text-primary-500 underline decoration-primary-500/40 underline-offset-2 transition-colors hover:text-primary-600 hover:decoration-primary-600";

  const originalBodyPrimaryClass = `m-0 ${INSIGHT_ORIGINAL_BODY_TEXT}`;
  const originalBodyMutedClass = `m-0 ${INSIGHT_BODY_MUTED}`;

  const originalBlock = (
    <div className="flex w-full min-w-0 max-w-full flex-col">
      <div className="relative w-full min-w-0 max-w-full">
        <div
          ref={originalContentRef}
          onClick={handleOriginalBodyClick}
          className={[
            !originalExpanded && originalOverflows ? "overflow-hidden" : "",
            originalOverflows ? "cursor-pointer rounded-sm" : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined}
          style={
            !originalExpanded && originalOverflows
              ? { maxHeight: ORIGINAL_COLLAPSED_MAX_PX }
              : undefined
          }
        >
          <div className="flex min-w-0 w-full max-w-full flex-col pl-0">
            {post ? (
          <>
            {!refPost ? (
              <>
                <div>
                  <OriginalPrimaryAndTranslation
                    rawBody={originalBody}
                    translation={originalTranslation}
                    isLoading={isLoading}
                    paragraphClassName={originalBodyPrimaryClass}
                    mutedClassName={originalBodyMutedClass}
                    linkClassName={linkifiedOriginalClass}
                    emptyLabel="暂无正文"
                  />
                </div>
                <OriginalMediaGallery
                  urls={mediaUrls}
                  tweetHref={sourceUrl}
                  videoLinkClassName={linkifiedOriginalClass}
                />
              </>
            ) : refPost.kind === "retweet" ? (
              <>
                {refPost.userName ? (
                  <p className="mb-2 font-sans text-[13px] font-normal leading-[21px] text-[#99a1af]">
                    转发自 @{refPost.userName.replace(/^@/, "")}
                    {refPost.name ? ` · ${formatTypography(refPost.name)}` : ""}
                  </p>
                ) : null}
                <div>
                  <OriginalPrimaryAndTranslation
                    rawBody={refBody.trim() ? refBody : originalBody}
                    translation={refBody.trim() ? refTranslation : originalTranslation}
                    isLoading={isLoading}
                    paragraphClassName={originalBodyPrimaryClass}
                    mutedClassName={originalBodyMutedClass}
                    linkClassName={linkifiedOriginalClass}
                    emptyLabel="暂无正文"
                  />
                </div>
                <OriginalMediaGallery
                  urls={refPost.mediaUrls ?? []}
                  tweetHref={referencedTweetHref}
                  videoLinkClassName={linkifiedOriginalClass}
                />
                {mediaUrls.length > 0 ? (
                  <OriginalMediaGallery
                    urls={mediaUrls}
                    tweetHref={sourceUrl}
                    videoLinkClassName={linkifiedOriginalClass}
                  />
                ) : null}
              </>
            ) : (
              <>
                <div>
                  <OriginalPrimaryAndTranslation
                    rawBody={originalBody}
                    translation={originalTranslation}
                    isLoading={isLoading}
                    paragraphClassName={originalBodyPrimaryClass}
                    mutedClassName={originalBodyMutedClass}
                    linkClassName={linkifiedOriginalClass}
                    emptyLabel="（无引用评论）"
                  />
                </div>
                <OriginalMediaGallery
                  urls={mediaUrls}
                  tweetHref={sourceUrl}
                  videoLinkClassName={linkifiedOriginalClass}
                />
                <div className="app-divider-border-l mt-4 bg-[#fafafa]/80 py-3 pl-3 pr-2">
                  <p className="m-0 mb-2 font-mono text-[9px] font-medium uppercase leading-none tracking-[0.12em] text-[#99a1af]">
                    引用原文
                  </p>
                  {refPost.userName ? (
                    <p className="m-0 mb-2 font-sans text-[13px] font-medium leading-[21px] text-[#6a7282]">
                      {refPost.name ? `${formatTypography(refPost.name)} ` : ""}@
                      {refPost.userName.replace(/^@/, "")}
                    </p>
                  ) : null}
                  <div>
                    <OriginalPrimaryAndTranslation
                      rawBody={refBody}
                      translation={refTranslation}
                      isLoading={isLoading}
                      paragraphClassName={originalBodyPrimaryClass}
                      mutedClassName={originalBodyMutedClass}
                      linkClassName={linkifiedOriginalClass}
                      emptyLabel="暂无引用正文"
                    />
                  </div>
                  <OriginalMediaGallery
                    urls={refPost.mediaUrls ?? []}
                    tweetHref={referencedTweetHref}
                    videoLinkClassName={linkifiedOriginalClass}
                  />
                </div>
              </>
            )}
          </>
        ) : (
          <p className={originalBodyMutedClass}>暂无帖子</p>
        )}
          </div>
        </div>
        {!originalExpanded && originalOverflows ? (
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white via-white/90 to-transparent"
            aria-hidden
          />
        ) : null}
      </div>
      {originalOverflows || sourceUrl ? (
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          {originalOverflows ? (
            <button
              type="button"
              onClick={() => setOriginalExpanded((v) => !v)}
              className="motion-layout-ease rounded-sm font-sans text-[13px] font-medium leading-[21px] text-[#6a7282] underline decoration-[#e5e7eb] underline-offset-2 outline-none transition-colors duration-150 hover:text-[#111113] hover:decoration-[#d1d5db] focus-visible:ring-2 focus-visible:ring-[#9ca3af] focus-visible:ring-offset-1"
            >
              {originalExpanded ? "收起正文" : "展开正文"}
            </button>
          ) : null}
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-sans text-[13px] font-medium leading-[21px] text-[#6a7282] underline decoration-[#e5e7eb] underline-offset-2 transition-colors duration-150 hover:text-[#0055FF] hover:decoration-[#0055FF]/40"
            >
              访问原文
              <svg
                className="h-3 w-3 shrink-0 opacity-70"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
              </svg>
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <aside
      data-name="INSIGHT (336*1024)"
      className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-white pb-[max(1rem,env(safe-area-inset-bottom,0px))] pl-4 pr-0 pt-5 sm:pl-5 sm:pt-6 lg:pl-6"
      aria-label="解读侧栏"
    >
      <div
        className="pointer-events-none absolute right-0 top-0 z-10 h-[2px] w-6 bg-[#FFB224]"
        aria-hidden
      />

      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-[24px] z-20 flex size-7 items-center justify-center rounded transition-colors hover:bg-gray-50"
          aria-label="关闭解读"
        >
          <svg className="size-4 text-[#6a7282]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : null}

      {/* 顶区：标题 + POST META（帖次元数据：作者 + 重要度），不随中部滚动 */}
      <div className="shrink-0 pr-4">
        <div className="relative flex h-[24px] w-full shrink-0 items-center gap-2">
          <div className="flex flex-col items-start justify-center">
            <span className="block h-[18px] font-sans text-[12px] font-bold uppercase leading-[18px] tracking-[1.2px] text-[#111113]">
              解读
            </span>
          </div>
          <div className="flex shrink-0 items-center justify-center rounded-[2px] bg-[#1A1C1E] px-[6px] py-[2px]">
            <span className="block h-[7px] font-sans text-[7px] font-bold uppercase leading-[7px] tracking-[0.7px] text-[#FFB224]">
              专业版
            </span>
          </div>
        </div>

        <div className="relative flex h-[24px] w-full shrink-0 items-center justify-between">
          <div className="flex h-full min-h-0 min-w-0 flex-[1_0_0] flex-col justify-center">
            <p className="m-0 w-full font-sans text-[10px] font-medium leading-[15px] text-[#FFB224]">
              实时 AI 解析与深度摘要。
            </p>
          </div>
        </div>

        <div className="h-3 w-full shrink-0" aria-hidden />

        <section className="relative box-border w-full shrink-0 pt-4" aria-label="作者与重要度">
          <PostMetaRow post={post} titleHref={titleHref} scoreDisplay={scoreDisplay} scoreLabel={scoreLabel} />
        </section>
      </div>

      {analysisError ? (
        <div
          className="mb-3 mr-4 flex shrink-0 flex-col gap-2 rounded-md border border-primary-100 bg-primary-50/80 px-3 py-2.5"
          role="alert"
        >
          <p className="m-0 font-sans text-[13px] font-normal leading-[20.8px] text-[#101828]">{analysisError}</p>
          {onRetryAnalysis ? (
            <button
              type="button"
              onClick={onRetryAnalysis}
              className="btn-press self-start rounded-md bg-primary-500 px-3 py-1.5 font-sans text-[11px] font-medium text-white transition-colors hover:bg-primary-600"
            >
              重试
            </button>
          ) : null}
        </div>
      ) : null}

      {/* 中区：单栏纵向滚动；原文高度随内容，要点/启发紧跟其下（不再被 flex-1 撑满顶到底） */}
      <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col self-stretch overflow-hidden pr-4">
        <div className="sidebar-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain">
          <section
            className="flex w-full max-w-full shrink-0 flex-col items-stretch gap-4 pt-4 pb-3"
            aria-labelledby="analysis-original-heading"
          >
            <SectionHeading
              id="analysis-original-heading"
              icon={<InsightSectionTitleIcon section="original" />}
              label="原文"
              onHeadingClick={
                originalOverflows
                  ? () => setOriginalExpanded((v) => !v)
                  : undefined
              }
              headingClickLabel={
                originalOverflows
                  ? originalExpanded
                    ? "收起正文"
                    : "展开正文"
                  : undefined
              }
              toggleAriaExpanded={originalOverflows ? originalExpanded : undefined}
              toggleAriaControls={originalOverflows ? "insight-original-body" : undefined}
              endSlot={
                originalOverflows ? (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#8A8A93]" aria-hidden>
                    <span
                      className={[
                        "motion-layout-ease relative h-[7.223px] w-[4.54px] text-[#8A8A93] transition-transform",
                        originalExpanded ? "rotate-90" : "rotate-0",
                      ].join(" ")}
                    >
                      <SourcesChevronRightGlyph className="absolute inset-0 block size-full max-w-none" />
                    </span>
                  </span>
                ) : null
              }
            />
            <div id="insight-original-body" className="min-w-0 w-full max-w-full shrink-0 pr-1">
              <div className="min-w-0 w-full max-w-full">{originalBlock}</div>
            </div>
          </section>

          <div
            className={[
              "flex shrink-0 flex-col pb-8",
              insightBottomBothCollapsed ? "gap-2 pt-2" : "gap-4 pt-4",
            ].join(" ")}
          >
          <section
            className={[
              "flex w-full max-w-full min-h-0 min-w-0 flex-col items-stretch overflow-hidden",
              keyPointsExpanded ? "gap-4" : "gap-0",
            ].join(" ")}
            aria-labelledby="analysis-highlights-heading"
          >
            <InsightCollapsibleSectionHeading
              section="keyPoints"
              label="要点"
              headingId="analysis-highlights-heading"
              controlsId="insight-key-points-body"
              expanded={keyPointsExpanded}
              onToggle={toggleKeyPointsSection}
            />
            <div
              className={[
                "motion-layout-ease grid w-full transition-[grid-template-rows]",
                keyPointsExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              ].join(" ")}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  id="insight-key-points-body"
                  className="min-h-0 w-full min-w-0 max-w-full overflow-visible"
                >
                  <div
                    onClick={handleKeyPointsBodyClick}
                    className={keyPointsExpanded ? "min-h-0 w-full cursor-pointer rounded-sm" : "min-h-0 w-full"}
                  >
                    <InsightNumberedBody
                      items={highlightLines}
                      isPending={keyPointsPending}
                      loadingLabel="正在生成要点…"
                      emptyLabel="暂无要点"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            className={[
              "box-border flex w-full min-w-0 max-w-full min-h-0 flex-col items-stretch overflow-hidden",
              relevanceExpanded ? "gap-4" : "gap-0",
            ].join(" ")}
            aria-labelledby="analysis-relevance-heading"
          >
            <InsightCollapsibleSectionHeading
              section="relevance"
              label="启发"
              headingId="analysis-relevance-heading"
              controlsId="insight-relevance-body"
              expanded={relevanceExpanded}
              onToggle={toggleRelevanceSection}
            />
            <div
              className={[
                "motion-layout-ease grid w-full transition-[grid-template-rows]",
                relevanceExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              ].join(" ")}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  id="insight-relevance-body"
                  className="box-border min-h-0 w-full min-w-0 max-w-full overflow-visible"
                >
                  <div
                    onClick={handleRelevanceBodyClick}
                    className={relevanceExpanded ? "min-h-0 w-full cursor-pointer rounded-sm" : "min-h-0 w-full"}
                  >
                    <InsightRelevanceSingle
                      text={contextText}
                      isPending={relevancePending}
                      loadingLabel="正在生成启发…"
                      emptyLabel="暂无启发"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
        </div>
      </div>

      {/* 底栏：8px 网格 — 32px 点击域、紧凑纵向边距、与内容区留白由上方 pb-8 承担 */}
      <div
        className="app-divider-border-t box-border flex w-full max-w-full shrink-0 items-center gap-4 bg-white py-2 pr-4"
        data-name="BOTTOM"
      >
        <button
          type="button"
          className="btn-press flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-[#6a7282] outline-none transition-colors hover:bg-[#f4f4f5] hover:text-[#111113] focus-visible:ring-2 focus-visible:ring-[#0055FF] focus-visible:ring-offset-1"
          aria-label="收藏"
        >
          <span className="relative flex size-3.5 shrink-0 items-center justify-center" aria-hidden>
            <img
              alt=""
              src="/analysis-bottom-icons/bookmark.svg"
              className="block h-3.5 w-auto max-w-full object-contain"
              decoding="async"
              draggable={false}
            />
          </span>
        </button>
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-press flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#6a7282] outline-none transition-colors hover:bg-[#f4f4f5] hover:text-[#111113] focus-visible:ring-2 focus-visible:ring-[#0055FF] focus-visible:ring-offset-1"
            aria-label="打开原文链接"
          >
            <span className="relative flex size-3.5 shrink-0 items-center justify-center" aria-hidden>
              <img
                alt=""
                src="/analysis-bottom-icons/open.svg"
                className="block size-3.5 max-h-full max-w-full object-contain"
                decoding="async"
                draggable={false}
              />
            </span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="flex h-8 w-8 shrink-0 cursor-not-allowed items-center justify-center rounded-md border-0 bg-transparent p-0 text-[#99a1af] opacity-50 outline-none"
            aria-label="打开"
          >
            <span className="relative flex size-3.5 shrink-0 items-center justify-center" aria-hidden>
              <img
                alt=""
                src="/analysis-bottom-icons/open.svg"
                className="block size-3.5 max-h-full max-w-full object-contain opacity-60"
                decoding="async"
                draggable={false}
              />
            </span>
          </button>
        )}
        <button
          type="button"
          className="btn-press flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-[#6a7282] outline-none transition-colors hover:bg-[#f4f4f5] hover:text-[#111113] focus-visible:ring-2 focus-visible:ring-[#0055FF] focus-visible:ring-offset-1"
          aria-label="分享"
        >
          <span className="relative flex size-3.5 shrink-0 items-center justify-center" aria-hidden>
            <img
              alt=""
              src="/analysis-bottom-icons/share.svg"
              className="block h-3.5 w-3 max-h-full max-w-full object-contain"
              decoding="async"
              draggable={false}
            />
          </span>
        </button>
      </div>
    </aside>
  );
}
