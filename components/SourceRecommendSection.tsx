"use client";

import { useMemo, useState } from "react";
import SourceAvatarImg from "@/components/SourceAvatarImg";
import Tooltip from "@/components/Tooltip";
import { sourceBioTagsLine } from "@/lib/source-bio-fallback";
import { defaultAvatarUrlForHandle } from "@/lib/source-avatar";
import { resolveSourceHomeUrl } from "@/lib/source-home-url";
import { resolveSourceProfile } from "@/lib/source-profile";
import { RECOMMENDED_SIDEBAR_LIMIT } from "@/lib/feed-quality";
import {
  SourcesActionRefreshGlyph,
  SourcesRecommendGlyph,
} from "@/components/sources-sidebar-icons";

export type RecommendSourceRow = {
  id: string;
  handle: string;
  name: string;
  url?: string;
  avatar?: string;
  description?: string;
  sourceType?: "blogger" | "media" | "academic";
};

type SourceRecommendSectionProps = {
  sources: RecommendSourceRow[];
  subscribedIds: Set<string>;
  subscribedHandles: Set<string>;
  isRefreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  onSubscribe?: (source: RecommendSourceRow) => void | Promise<void>;
};

function RecommendSourceCard({
  source,
  onSubscribe,
  avatarPriority,
}: {
  source: RecommendSourceRow;
  onSubscribe?: (source: RecommendSourceRow) => void | Promise<void>;
  avatarPriority?: boolean;
}) {
  const [isSubscribing, setIsSubscribing] = useState(false);
  const profile = resolveSourceProfile({
    handle: source.handle,
    platform: "X",
    avatar: source.avatar,
    description: source.description,
  });
  const sourceHomeUrl = resolveSourceHomeUrl(source);
  const bioTagsLine = sourceBioTagsLine(profile.description, source.handle);

  const handleSubscribe = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onSubscribe || isSubscribing) return;
    setIsSubscribing(true);
    try {
      await onSubscribe(source);
    } finally {
      setIsSubscribing(false);
    }
  };

  return (
    <div className="animate-fade-in flex w-full shrink-0 items-start gap-3 rounded-[2px] border border-transparent py-2">
      <Tooltip content={`打开 ${source.name} 主页`}>
        <a
          href={sourceHomeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-press shrink-0 rounded-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30 focus-visible:ring-offset-2"
          aria-label={`打开 ${source.name} 主页`}
        >
          <SourceAvatarImg
            src={profile.avatar}
            fallbackSrc={defaultAvatarUrlForHandle(source.handle)}
            alt={source.name}
            letter={source.name}
            imgClassName="h-8 w-8 shrink-0 rounded-[2px] border border-[#F0F0F2] object-cover shadow-xs box-border"
            placeholderClassName="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-[#F0F0F2] bg-gray-200 text-[12px] font-semibold text-[#6a7282] shadow-xs"
            priority={avatarPriority}
          />
        </a>
      </Tooltip>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-h-[13px] items-start justify-between gap-2 self-stretch">
          <div className="min-w-0 flex-1">
            <Tooltip content={`打开 ${source.name} 主页`}>
              <a
                href={sourceHomeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate rounded-[3px] text-[12px] font-semibold leading-4 tracking-[-0.325px] text-[#111113] transition-colors hover:text-[#0055FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30"
                aria-label={`打开 ${source.name} 主页`}
              >
                {source.name}
              </a>
            </Tooltip>
            <div className="min-h-[17px] text-[12px] font-medium leading-5 text-[#8A8A93]">@{source.handle}</div>
          </div>
          {onSubscribe ? (
            <button
              type="button"
              data-tooltip-exclude=""
              onClick={(e) => void handleSubscribe(e)}
              disabled={isSubscribing}
              className="btn-press inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-[#0055FF]/25 bg-white px-2.5 text-[12px] font-semibold text-[#0055FF] transition-[background-color,border-color,opacity] duration-150 ease-out hover:border-[#0055FF]/40 hover:bg-[#0055FF]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              aria-label={`订阅 ${source.name}`}
            >
              {isSubscribing ? "订阅中…" : "订阅"}
            </button>
          ) : null}
        </div>
        <p className="m-0 min-h-[18.8px] w-full min-w-0 truncate text-left text-[12px] font-normal leading-5 text-[#666666]">
          {bioTagsLine}
        </p>
      </div>
    </div>
  );
}

export default function SourceRecommendSection({
  sources,
  subscribedIds,
  subscribedHandles,
  isRefreshing = false,
  onRefresh,
  onSubscribe,
}: SourceRecommendSectionProps) {
  const visible = useMemo(
    () =>
      sources
        .filter((s) => {
          if (subscribedIds.has(s.id)) return false;
          if (subscribedHandles.has(s.handle.toLowerCase())) return false;
          return true;
        })
        .slice(0, RECOMMENDED_SIDEBAR_LIMIT),
    [sources, subscribedIds, subscribedHandles]
  );

  return (
    <section className="flex flex-col gap-3 border-t border-[#f0f0f0] pt-4" aria-label="推荐订阅">
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative h-[14px] w-[15px] shrink-0 text-[#0055FF]" aria-hidden>
          <SourcesRecommendGlyph className="absolute inset-0 block size-full max-w-none" />
        </span>
        <h3 className="m-0 shrink-0 font-mono text-[13px] font-semibold uppercase leading-[19.5px] tracking-[1.1px] text-[#0055FF]">
          推荐订阅
        </h3>
        {onRefresh ? (
          <Tooltip content="换一批推荐">
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={isRefreshing}
              className="btn-press -ml-0.5 flex size-6 shrink-0 items-center justify-center rounded-[4px] text-[#111113] opacity-80 transition-[background-color,opacity] hover:bg-[#f3f4f6] hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30 disabled:pointer-events-none disabled:opacity-50"
              aria-label={isRefreshing ? "正在刷新推荐" : "刷新推荐"}
            >
              <SourcesActionRefreshGlyph
                className={[
                  "h-3 w-3 shrink-0",
                  isRefreshing ? "animate-spin" : "",
                ].join(" ")}
              />
            </button>
          </Tooltip>
        ) : null}
      </div>
      {visible.length > 0 ? (
        <div className="flex flex-col gap-1">
          {visible.map((source, index) => (
            <RecommendSourceCard
              key={source.id}
              source={source}
              onSubscribe={onSubscribe}
              avatarPriority={index < 3}
            />
          ))}
        </div>
      ) : (
        <p className="m-0 text-[12px] font-normal leading-5 text-[#8A8A93]">
          暂无推荐信息源。可先通过上方链接添加，或稍后重试。
        </p>
      )}
    </section>
  );
}
