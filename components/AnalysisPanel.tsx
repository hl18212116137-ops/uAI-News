"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { NewsItem } from "@/lib/types";
import { isMostlyChinese } from "@/lib/text-locale";
import { formatTypography } from "@/lib/utils";
import LinkifiedParagraph, { BoldLinkifiedInline } from "@/components/LinkifiedParagraph";
import SourceAvatarImg from "@/components/SourceAvatarImg";

/** ORIGINAL 正文默认折叠高度（px），超出则显示展开 */
const ORIGINAL_COLLAPSED_MAX_PX = 220;

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
  if (pct >= 80) return "High priority";
  if (pct >= 50) return "Notable";
  return "Lower priority";
}

/** INSIGHT ORIGINAL：仅展示中文（优先 AI 译文，否则已为中文的原文）。 */
function resolveChineseOriginalText(originalTranslation: string, originalBody: string): string | null {
  if (originalTranslation) return originalTranslation;
  if (originalBody && isMostlyChinese(originalBody)) return originalBody;
  return null;
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
            <p className="m-0 font-sans text-[12px] font-medium leading-5 tracking-[-0.01em] text-[#101828]">
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
              <span className="font-sans text-[12px] leading-5 text-[#99a1af]">暂无原推文链接</span>
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

function AnalysisSectionIconOriginal() {
  return (
    <div className="relative h-[14px] w-[12px] shrink-0" data-name="Container">
      <img
        alt=""
        src="/analysis-section-icons/original.svg"
        className="absolute block size-full max-w-none"
        decoding="async"
        draggable={false}
        aria-hidden
      />
    </div>
  );
}

function AnalysisSectionIconContext() {
  return (
    <div className="relative h-[11.307px] w-[13.974px] shrink-0" data-name="Container">
      <img
        alt=""
        src="/analysis-section-icons/context.svg"
        className="absolute block size-full max-w-none"
        decoding="async"
        draggable={false}
        aria-hidden
      />
    </div>
  );
}

/** X 资料卡式蓝标（无后端「已认证」字段时，仅 X 源展示视觉占位）。 */
function XStyleVerifiedBadge({ className }: { className?: string }) {
  return (
    <span className={className ?? "inline-flex shrink-0"} title="X" aria-hidden>
      <svg className="h-[10px] w-[10px]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="#1D9BF0" />
        <path
          d="M8 12.5l2.2 2.2L16 9"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * POST META：极简信息行 — 留白与细线分区，无底色块、无投影；分数为唯一主色焦点。
 */
function PostMetaRow({
  post,
  titleHref,
  isX,
  scoreDisplay,
  scoreLabel,
}: {
  post: NewsItem | null;
  titleHref: string;
  isX: boolean;
  scoreDisplay: string;
  scoreLabel: string;
}) {
  return (
    <div
      className="flex w-full min-w-0 items-center justify-between gap-4"
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {post ? (
          <>
            <SourceAvatarImg
              src={post.source.avatar}
              alt={post.source.name || "来源"}
              letter={post.source.name || post.source.handle || "?"}
              imgClassName="h-[18px] w-[18px] shrink-0 rounded-[2px] object-cover"
              placeholderClassName="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[2px] bg-[#f3f4f6] text-[8px] font-semibold text-[#99a1af]"
            />
            <div className="flex min-w-0 items-center gap-1">
              <a
                href={titleHref}
                target="_blank"
                rel="noopener noreferrer"
                className="motion-layout-ease min-w-0 truncate font-sans text-[13px] font-medium leading-5 tracking-[-0.02em] text-[#101828] antialiased transition-colors duration-150 hover:text-primary-600"
              >
                {formatTypography(post.source.name || post.source.handle || "未知来源")}
              </a>
              {isX ? <XStyleVerifiedBadge className="inline-flex shrink-0 translate-y-px opacity-[0.88]" /> : null}
            </div>
          </>
        ) : (
          <span className="truncate font-sans text-[13px] font-normal leading-5 text-[#99a1af]">—</span>
        )}
      </div>

      <div className="flex min-w-0 shrink-0 flex-col items-end gap-0.5 border-l border-[#f3f4f6] pl-3">
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-[14px] font-semibold leading-none tracking-[-0.03em] text-primary-600 tabular-nums">
            {scoreDisplay}
          </span>
          <span className="font-mono text-[10px] font-normal leading-none text-[#99a1af]">/100</span>
        </div>
        {scoreLabel ? (
          <span className="max-w-full truncate text-right font-sans text-[10px] font-normal leading-snug tracking-[-0.01em] text-[#6a7282]">
            {scoreLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SectionHeading({
  icon,
  label,
  id,
  allCaps = true,
}: {
  icon: ReactNode;
  label: string;
  id?: string;
  /** false：保留大小写（如 KEY POINTS / RELEVANCE） */
  allCaps?: boolean;
}) {
  return (
    <div id={id} className="relative flex w-full shrink-0 items-center gap-[6px]">
      {icon}
      <div
        className={`relative flex h-[17px] shrink-0 flex-col justify-center font-mono text-[11px] font-bold tracking-[1.1px] text-[#0055FF] ${allCaps ? "uppercase" : "normal-case"}`}
      >
        <p className="m-0 leading-[16.5px]">{label}</p>
      </div>
    </div>
  );
}

function AnalysisSectionIconReview() {
  return (
    <div className="relative h-[13px] w-[12px] shrink-0" data-name="Container">
      <img
        alt=""
        src="/analysis-section-icons/review.svg"
        className="absolute block size-full max-w-none"
        decoding="async"
        draggable={false}
        aria-hidden
      />
    </div>
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

/** RELEVANCE：单句启发，无编号 */
function InsightRelevanceSingle({
  text,
  isLoading,
  loadingLabel,
  emptyLabel,
}: {
  text: string;
  isLoading: boolean;
  loadingLabel: string;
  emptyLabel: string;
}) {
  const lineClass =
    "m-0 min-w-0 font-sans text-[12px] font-normal leading-[20px] text-[#52525b] whitespace-pre-wrap break-words";
  const mutedClass =
    "m-0 font-sans text-[12px] font-normal leading-[18px] text-[#99a1af]";
  const t = text.trim();
  if (!t) {
    return <p className={mutedClass}>{isLoading ? loadingLabel : emptyLabel}</p>;
  }
  return (
    <p className={lineClass}>
      <BoldLinkifiedInline text={t} />
    </p>
  );
}

function InsightNumberedBody({
  items,
  isLoading,
  loadingLabel,
  emptyLabel,
}: {
  items: string[];
  isLoading: boolean;
  loadingLabel: string;
  emptyLabel: string;
}) {
  const lineClass =
    "m-0 min-w-0 flex-1 font-sans text-[12px] font-normal leading-[20px] text-[#52525b] whitespace-pre-wrap break-words";
  const mutedClass =
    "m-0 font-sans text-[12px] font-normal leading-[18px] text-[#99a1af]";

  if (items.length === 0) {
    return <p className={mutedClass}>{isLoading ? loadingLabel : emptyLabel}</p>;
  }

  return (
    <ol className="m-0 flex list-none flex-col gap-2.5 p-0" role="list">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5" role="listitem">
          <span
            className="w-5 shrink-0 pt-px text-right font-mono text-[12px] font-semibold tabular-nums leading-[20px] text-[#99a1af]"
            aria-hidden
          >
            {i + 1}.
          </span>
          <p className={lineClass}>
            <BoldLinkifiedInline text={item} />
          </p>
        </li>
      ))}
    </ol>
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

  const contextText = analysis?.contextMatch?.trim() ?? "";
  const highlightLines = normalizeHighlightLines(analysis?.review ?? null).slice(0, 3);
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
  const isX = post?.source?.platform === "X";
  const mediaUrls = post?.mediaUrls?.filter((u) => typeof u === "string" && /^https:\/\//i.test(u)) ?? [];

  const chineseOuter = resolveChineseOriginalText(originalTranslation, originalBody);
  const chineseRef = resolveChineseOriginalText(refTranslation, refBody);

  const originalContentRef = useRef<HTMLDivElement>(null);
  const [originalExpanded, setOriginalExpanded] = useState(false);
  const [originalOverflows, setOriginalOverflows] = useState(false);

  useEffect(() => {
    setOriginalExpanded(false);
  }, [post?.id]);

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
    chineseOuter,
    chineseRef,
    isLoading,
    mediaUrls.length,
    refPost?.kind,
    refMediaLen,
  ]);

  const linkifiedPrimaryClass =
    "break-all font-semibold text-primary-500 underline decoration-primary-500/40 underline-offset-2 transition-colors hover:text-primary-600 hover:decoration-primary-600";

  const originalBodyPrimaryClass =
    "m-0 font-sans text-[13px] font-normal leading-[21px] tracking-[-0.01em] text-[#52525b] whitespace-pre-wrap break-words";
  const originalBodyMutedClass =
    "m-0 font-sans text-[13px] font-normal leading-[21px] text-[#99a1af]";

  const originalBlock = (
    <div className="flex flex-col">
      <div className="relative">
        <div
          ref={originalContentRef}
          className={!originalExpanded && originalOverflows ? "overflow-hidden" : undefined}
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
                  {chineseOuter ? (
                    <LinkifiedParagraph
                      text={formatTypography(chineseOuter)}
                      linkClassName={linkifiedPrimaryClass}
                      className={originalBodyPrimaryClass}
                    />
                  ) : isLoading ? (
                    <p className={originalBodyMutedClass}>生成中文内容中…</p>
                  ) : (
                    <p className={originalBodyMutedClass}>暂无中文正文</p>
                  )}
                </div>
                <OriginalMediaGallery
                  urls={mediaUrls}
                  tweetHref={sourceUrl}
                  videoLinkClassName={linkifiedPrimaryClass}
                />
              </>
            ) : refPost.kind === "retweet" ? (
              <>
                {refPost.userName ? (
                  <p className="mb-2 font-sans text-[11px] font-normal leading-4 text-[#99a1af]">
                    转发自 @{refPost.userName.replace(/^@/, "")}
                    {refPost.name ? ` · ${formatTypography(refPost.name)}` : ""}
                  </p>
                ) : null}
                <div>
                  {chineseRef ?? chineseOuter ? (
                    <LinkifiedParagraph
                      text={formatTypography((chineseRef ?? chineseOuter)!)}
                      linkClassName={linkifiedPrimaryClass}
                      className={originalBodyPrimaryClass}
                    />
                  ) : isLoading ? (
                    <p className={originalBodyMutedClass}>生成中文内容中…</p>
                  ) : (
                    <p className={originalBodyMutedClass}>暂无中文正文</p>
                  )}
                </div>
                <OriginalMediaGallery
                  urls={refPost.mediaUrls ?? []}
                  tweetHref={referencedTweetHref}
                  videoLinkClassName={linkifiedPrimaryClass}
                />
                {mediaUrls.length > 0 ? (
                  <OriginalMediaGallery
                    urls={mediaUrls}
                    tweetHref={sourceUrl}
                    videoLinkClassName={linkifiedPrimaryClass}
                  />
                ) : null}
              </>
            ) : (
              <>
                <div>
                  {chineseOuter ? (
                    <LinkifiedParagraph
                      text={formatTypography(chineseOuter)}
                      linkClassName={linkifiedPrimaryClass}
                      className={originalBodyPrimaryClass}
                    />
                  ) : isLoading ? (
                    <p className={originalBodyMutedClass}>生成中文内容中…</p>
                  ) : (
                    <p className={originalBodyMutedClass}>（无引用评论）</p>
                  )}
                </div>
                <OriginalMediaGallery
                  urls={mediaUrls}
                  tweetHref={sourceUrl}
                  videoLinkClassName={linkifiedPrimaryClass}
                />
                <div className="mt-4 border-l-2 border-[#ececee] bg-[#fafafa]/80 py-3 pl-3 pr-2">
                  <p className="m-0 mb-2 font-mono text-[9px] font-medium uppercase leading-none tracking-[0.12em] text-[#99a1af]">
                    引用原文
                  </p>
                  {refPost.userName ? (
                    <p className="m-0 mb-2 font-sans text-[11px] font-medium leading-4 text-[#6a7282]">
                      {refPost.name ? `${formatTypography(refPost.name)} ` : ""}@
                      {refPost.userName.replace(/^@/, "")}
                    </p>
                  ) : null}
                  <div>
                    {chineseRef ? (
                      <LinkifiedParagraph
                        text={formatTypography(chineseRef)}
                        linkClassName={linkifiedPrimaryClass}
                        className={originalBodyPrimaryClass}
                      />
                    ) : isLoading ? (
                      <p className={originalBodyMutedClass}>生成中文内容中…</p>
                    ) : (
                      <p className={originalBodyMutedClass}>暂无引用正文译文</p>
                    )}
                  </div>
                  <OriginalMediaGallery
                    urls={refPost.mediaUrls ?? []}
                    tweetHref={referencedTweetHref}
                    videoLinkClassName={linkifiedPrimaryClass}
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
      {originalOverflows ? (
        <button
          type="button"
          onClick={() => setOriginalExpanded((v) => !v)}
          className="motion-layout-ease mt-2 self-start rounded-sm font-sans text-[11px] font-medium text-[#0055FF] underline decoration-[#0055FF]/40 outline-none transition-colors hover:text-primary-600 hover:decoration-primary-600 focus-visible:ring-2 focus-visible:ring-[#0055FF] focus-visible:ring-offset-1"
        >
          {originalExpanded ? "收起正文" : "展开正文"}
        </button>
      ) : null}
    </div>
  );

  return (
    <aside
      data-name="INSIGHT (336*1024)"
      className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-white pt-[24px] pb-0 pl-[24px] pr-0"
      aria-label="Insight"
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
          aria-label="Close analysis"
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
              INSIGHT
            </span>
          </div>
          <div className="flex shrink-0 items-center justify-center rounded-[2px] bg-[#1A1C1E] px-[6px] py-[2px]">
            <span className="block h-[7px] font-sans text-[7px] font-bold uppercase leading-[7px] tracking-[0.7px] text-[#FFB224]">
              PRO
            </span>
          </div>
        </div>

        <div className="relative flex h-[24px] w-full shrink-0 items-center justify-between">
          <div className="flex h-full min-h-0 min-w-0 flex-[1_0_0] flex-col justify-center">
            <p className="m-0 w-full font-sans text-[10px] font-medium leading-[15px] text-[#FFB224]">
              Real-time AI telemetry &amp; deep decoding.
            </p>
          </div>
        </div>

        <div className="h-4 w-full shrink-0" aria-hidden />

        <section
          className="relative box-border w-full shrink-0 border-t border-[#f3f4f6] pt-4"
          aria-labelledby="analysis-post-meta-heading"
        >
          <p
            id="analysis-post-meta-heading"
            className="m-0 mb-3 font-sans text-[10px] font-medium uppercase leading-4 tracking-[0.1em] text-[#99a1af]"
          >
            Post meta
          </p>
          <PostMetaRow
            post={post}
            titleHref={titleHref}
            isX={isX}
            scoreDisplay={scoreDisplay}
            scoreLabel={scoreLabel}
          />
        </section>
      </div>

      {analysisError ? (
        <div
          className="mb-3 mr-4 flex shrink-0 flex-col gap-2 rounded-md border border-primary-100 bg-primary-50/80 px-3 py-2.5"
          role="alert"
        >
          <p className="m-0 font-sans text-[14px] font-normal leading-[22.4px] text-[#101828]">{analysisError}</p>
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

      {/* 中区：ORIGINAL 占满剩余高度内滚；KEY POINTS 编号 + RELEVANCE 单句 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pr-4">
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 py-6"
          aria-labelledby="analysis-original-heading"
        >
          <SectionHeading
            id="analysis-original-heading"
            icon={<AnalysisSectionIconOriginal />}
            label="ORIGINAL"
          />
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pr-1">{originalBlock}</div>
        </section>

        <div className="flex min-h-0 shrink-0 flex-col gap-5 border-t border-[#f3f4f6] pt-4">
          <section
            className="flex max-h-[28vh] min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain"
            aria-labelledby="analysis-highlights-heading"
          >
            <SectionHeading
              id="analysis-highlights-heading"
              icon={<AnalysisSectionIconReview />}
              label="KEY POINTS"
              allCaps={false}
            />
            <InsightNumberedBody
              items={highlightLines}
              isLoading={isLoading}
              loadingLabel="正在生成要点…"
              emptyLabel="暂无要点"
            />
          </section>

          <section
            className="flex max-h-[28vh] min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain pb-1"
            aria-labelledby="analysis-relevance-heading"
          >
            <SectionHeading
              id="analysis-relevance-heading"
              icon={<AnalysisSectionIconContext />}
              label="RELEVANCE"
              allCaps={false}
            />
            <InsightRelevanceSingle
              text={contextText}
              isLoading={isLoading}
              loadingLabel="正在生成一句启发…"
              emptyLabel="暂无启发"
            />
          </section>
        </div>
      </div>

      {/* 底栏 */}
      <div
        className="box-border flex w-full max-w-full shrink-0 items-center gap-[36px] border-t border-[#f3f4f6] bg-white py-[12px] pr-4"
        data-name="BOTTOM"
      >
        <button
          type="button"
          className="relative flex shrink-0 items-center justify-center border-0 bg-transparent p-0 outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#0055FF] focus-visible:ring-offset-1"
          aria-label="Bookmark"
        >
          <div className="relative h-[15px] w-[11.667px] shrink-0">
            <img
              alt=""
              src="/analysis-bottom-icons/bookmark.svg"
              className="absolute block size-full max-w-none"
              decoding="async"
              draggable={false}
              aria-hidden
            />
          </div>
        </button>
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative flex shrink-0 items-center justify-center outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#0055FF] focus-visible:ring-offset-1"
            aria-label="Open original link"
          >
            <div className="relative size-[15px] shrink-0">
              <img
                alt=""
                src="/analysis-bottom-icons/open.svg"
                className="absolute block size-full max-w-none"
                decoding="async"
                draggable={false}
                aria-hidden
              />
            </div>
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="relative flex shrink-0 cursor-not-allowed items-center justify-center border-0 bg-transparent p-0 opacity-40 outline-none"
            aria-label="Open"
          >
            <div className="relative size-[15px] shrink-0">
              <img
                alt=""
                src="/analysis-bottom-icons/open.svg"
                className="absolute block size-full max-w-none"
                decoding="async"
                draggable={false}
                aria-hidden
              />
            </div>
          </button>
        )}
        <button
          type="button"
          className="relative flex shrink-0 items-center justify-center border-0 bg-transparent p-0 outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#0055FF] focus-visible:ring-offset-1"
          aria-label="Share"
        >
          <div className="relative h-[16.667px] w-[15px] shrink-0">
            <img
              alt=""
              src="/analysis-bottom-icons/share.svg"
              className="absolute block size-full max-w-none"
              decoding="async"
              draggable={false}
              aria-hidden
            />
          </div>
        </button>
      </div>
    </aside>
  );
}
