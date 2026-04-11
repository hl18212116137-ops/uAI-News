"use client";

import { useState, useMemo, useEffect, useRef, memo, useCallback } from "react";
import SourceAvatarImg from "./SourceAvatarImg";
import type { User } from "@supabase/supabase-js";
import AddSourceModal from "./AddSourceModal";
import Tooltip from "./Tooltip";
import { sourceBioTagsLine } from "@/lib/source-bio-fallback";
import {
  SourcesAcademiaGlyph,
  SourcesActionPlusGlyph,
  SourcesActionRefreshGlyph,
  SourcesBloggersGlyph,
  SourcesChevronRightGlyph,
  SourcesMediaGlyph,
  SourcesRecommendGlyph,
  SourcesSearchGlyph,
} from "@/components/sources-sidebar-icons";

type Source = {
  handle: string;
  name: string;
  avatar?: string;
  description?: string;
  postCount: number;
  latestPostTime?: string;
  id: string;
  sourceType?: 'blogger' | 'media' | 'academic';
};

type SourcesListProps = {
  sources: Source[];              // 已订阅的信息源
  recommendedSources?: Source[];  // 推荐关注的信息源（未订阅）
  currentSource?: string;
  onSourceSelect: (handle?: string) => void;
  onAddSource?: () => void;
  subscribedIds?: Set<string>;
  onToggleSubscription?: (sourceId: string, sourceHandle: string) => void;
  /** 侧栏单源后台抓取中：该源 postCount 位显示转圈 */
  fetchingSourceIds?: Set<string>;
  user: User | null;              // 当前用户
  isCollapsed: boolean;            // 受控状态：是否折叠
  onToggleCollapse: () => void;    // 切换折叠状态的回调
};

function isSourceRowActive(handle: string | undefined, currentSource: string) {
  if (!handle && !currentSource) return true;
  return handle === currentSource;
}

type SourcesListSourceCardProps = {
  source: Source;
  variant: "subscribed" | "recommended";
  isSubscribed: boolean;
  currentSource: string;
  onSourceSelect: (handle: string) => void;
  onToggleSubscription?: (sourceId: string, sourceHandle: string) => void;
  recommendRowDataName?: string;
  recommendRowNodeId?: string;
  avatarPriority?: boolean;
  isFetching?: boolean;
};

function SourcesListSourceCard({
  source,
  variant,
  isSubscribed,
  currentSource,
  onSourceSelect,
  onToggleSubscription,
  recommendRowDataName,
  recommendRowNodeId,
  avatarPriority = false,
  isFetching = false,
}: SourcesListSourceCardProps) {
  const isRec = variant === "recommended";
  const bioTagsLine = sourceBioTagsLine(source.description, source.handle);
  const rowActive = !isRec && isSourceRowActive(source.handle, currentSource);

  return (
    <Tooltip
      content={
        isRec
          ? "点此行不会筛选动态；使用右侧 + 关注此信息源"
          : `点击查看 ${source.name} 的推文`
      }
      excludeSelector="[data-tooltip-exclude]"
    >
      <div
        onClick={variant === "subscribed" ? () => onSourceSelect(source.handle) : undefined}
        data-name={isRec ? recommendRowDataName : undefined}
        data-node-id={isRec ? recommendRowNodeId : undefined}
        className={[
          "motion-layout-ease relative box-border flex w-full shrink-0 items-start rounded-[2px] border border-solid border-transparent transition-colors",
          isRec ? "self-stretch gap-3 py-2 px-0" : "gap-3 px-px py-[9px]",
          rowActive ? "" : "hover:bg-[#f9fafb]/80",
          variant === "subscribed" ? "cursor-pointer" : "cursor-default",
        ].join(" ")}
      >
        <SourceAvatarImg
          src={source.avatar}
          alt={source.name}
          letter={source.name}
          imgClassName={[
            "w-8 h-8 rounded-[2px] flex-shrink-0 object-cover",
            isRec ? "border border-[#F0F0F2] shadow-xs box-border" : "",
          ].join(" ")}
          placeholderClassName={[
            "w-8 h-8 rounded-[2px] flex items-center justify-center text-[11px] font-semibold flex-shrink-0 bg-gray-200 text-[#6a7282]",
            isRec ? "border border-[#F0F0F2] shadow-xs" : "",
          ].join(" ")}
          priority={avatarPriority}
        />
        <div
          className={[
            "flex min-h-0 min-w-0 flex-1 flex-col items-stretch",
            isRec ? "gap-0.5" : "gap-1",
          ].join(" ")}
        >
          <div
            className={[
              "flex min-h-[13px] items-center justify-between self-stretch",
              isRec ? "gap-0" : "gap-2",
            ].join(" ")}
          >
            <span
              className={[
                "truncate text-[#111113] text-[12px] leading-[12px]",
                isRec ? "min-w-0 flex-1 font-semibold tracking-[-0.325px]" : "font-medium",
              ].join(" ")}
            >
              {source.name}
            </span>
            <div
              className={[
                "flex min-h-px min-w-0 flex-shrink-0 items-center justify-end",
                isRec ? "gap-0" : "gap-2",
              ].join(" ")}
            >
              {!isRec && (
                <Tooltip content={isFetching ? "正在抓取推文" : "已收录推文数"}>
                  <span
                    className="inline-flex min-w-[1em] cursor-default items-center justify-center font-mono text-[10px] font-medium tabular-nums leading-[10px] text-[#0055FF]"
                    data-tooltip-exclude=""
                  >
                    {isFetching ? (
                      <span
                        className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-[#0055FF] border-t-transparent"
                        aria-hidden
                      />
                    ) : (
                      source.postCount
                    )}
                  </span>
                </Tooltip>
              )}
              {isRec && onToggleSubscription ? (
                <Tooltip content={isSubscribed ? "取消关注" : "关注此信息源"}>
                  <button
                    data-tooltip-exclude=""
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleSubscription(source.id, source.handle);
                    }}
                    data-name="Button"
                    className={[
                      "flex size-4 shrink-0 items-center justify-center rounded-[12px] transition-opacity",
                      isSubscribed ? "opacity-90 hover:opacity-70" : "opacity-80 hover:opacity-100",
                    ].join(" ")}
                    aria-label={isSubscribed ? "取消关注" : "关注"}
                  >
                    {isSubscribed ? (
                      <svg className="h-2 w-2 text-[#fb2c36]" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <SourcesActionPlusGlyph className="size-2 shrink-0" />
                    )}
                  </button>
                </Tooltip>
              ) : null}
            </div>
          </div>
          <div
            className={[
              "w-full min-h-[17px] text-[12px] text-[#8A8A93] leading-[20px]",
              isRec ? "font-medium" : "font-normal",
            ].join(" ")}
          >
            @{source.handle}
          </div>
          {isRec ? (
            <div className="min-h-[18.8px] w-full min-w-0 shrink-0">
              <p className="m-0 w-full min-w-0 truncate text-left text-[12px] font-normal leading-[20px] text-[#666666]">
                {bioTagsLine}
              </p>
            </div>
          ) : (
            <p className="m-0 w-full min-h-[20px] min-w-0 truncate text-left text-[12px] font-normal leading-[20px] text-[#666666]">
              {bioTagsLine}
            </p>
          )}
        </div>
      </div>
    </Tooltip>
  );
}

type RecommendPanelProps = {
  filteredRecommended: Source[];
  subscribedIds: Set<string>;
  isRefreshingRecommended: boolean;
  onRefresh: () => void | Promise<void>;
  onSourceSelect: (handle: string) => void;
  onToggleSubscription?: (sourceId: string, sourceHandle: string) => void;
  currentSource: string;
};

const RecommendPanel = memo(function RecommendPanel({
  filteredRecommended,
  subscribedIds,
  isRefreshingRecommended,
  onRefresh,
  onSourceSelect,
  onToggleSubscription,
  currentSource,
}: RecommendPanelProps) {
  return (
    <div
      data-name="RECOMMEND"
      data-node-id="37:4643"
      className="relative z-[4] flex min-h-[214.58px] w-full min-w-0 shrink-0 flex-col items-stretch gap-0 pr-3 [contain:paint]"
    >
      <div
        data-name="Horizontal Divider"
        data-node-id="37:4644"
        className="app-divider-h shrink-0"
        aria-hidden
      />
      <div
        data-name="Container"
        data-node-id="37:4645"
        className="relative flex w-full min-w-0 shrink-0 flex-col items-stretch gap-[15.99px] pt-6"
      >
        <div
          data-name="Adjusted hairline width and alignment within Sidebar"
          data-node-id="37:4646"
          className="relative flex w-full min-w-0 shrink-0 items-end justify-between"
        >
          <div
            data-name="16px (mb-4) margin after RECOMMEND header → Heading 2"
            data-node-id="37:4647"
            className="relative flex min-w-0 shrink-0 items-center gap-2"
          >
            <div
              className="relative h-[14.34px] w-[15.02px] shrink-0 text-[#0055FF]"
              data-name="Container"
              data-node-id="37:4648"
            >
              <SourcesRecommendGlyph className="absolute inset-0 block size-full max-w-none" aria-hidden />
            </div>
            <div
              data-node-id="37:4650"
              className="relative flex h-[17px] w-[69.31px] shrink-0 flex-col justify-center font-mono text-[11px] font-semibold uppercase leading-[16.5px] tracking-[1.1px] text-[#0055FF]"
            >
              <p className="m-0">推荐</p>
            </div>
          </div>
          <Tooltip content="换一批推荐">
            <button
              type="button"
              data-name="Button"
              data-node-id="37:4651"
              onClick={() => void onRefresh()}
              disabled={isRefreshingRecommended}
              className="relative flex size-4 shrink-0 items-center justify-center opacity-80 transition-opacity hover:opacity-100 disabled:opacity-50"
              aria-label="刷新推荐"
            >
              <SourcesActionRefreshGlyph
                className="h-[10.94px] w-[10.97px] shrink-0 text-[#111113]"
                data-name="Container"
                data-node-id="37:4652"
              />
            </button>
          </Tooltip>
        </div>
        {filteredRecommended.length > 0 ? (
          filteredRecommended.map((source, index) => (
            <SourcesListSourceCard
              key={source.handle}
              source={source}
              isSubscribed={subscribedIds.has(source.id)}
              variant="recommended"
              currentSource={currentSource}
              onSourceSelect={onSourceSelect}
              onToggleSubscription={onToggleSubscription}
              recommendRowDataName={
                index === 0
                  ? "16px (space-y-4) spacing between individual recommendation cards"
                  : index === 1
                    ? "Border"
                    : undefined
              }
              recommendRowNodeId={index === 0 ? "37:4654" : index === 1 ? "37:4668" : undefined}
              avatarPriority={index < 2}
            />
          ))
        ) : (
          <p className="m-0 w-full text-[12px] font-normal leading-[20px] text-[#8A8A93]">
            暂无推荐信息源。可先添加信息源，或稍后重试。
          </p>
        )}
      </div>
    </div>
  );
});

export default function SourcesList({
  sources,
  recommendedSources = [],
  currentSource,
  onSourceSelect,
  onAddSource,
  subscribedIds = new Set(),
  onToggleSubscription,
  fetchingSourceIds,
  user,
  isCollapsed,
  onToggleCollapse,
}: SourcesListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isRefreshingRecommended, setIsRefreshingRecommended] = useState(false);
  const [displayedRecommended, setDisplayedRecommended] = useState<Source[]>(recommendedSources);
  const [openSections, setOpenSections] = useState<Record<"blogger" | "media" | "academic", boolean>>({
    blogger: true,
    media: false,
    academic: false,
  });

  const recommendedPropsKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = [...recommendedSources]
      .map((s) => `${s.id}\0${s.handle}`)
      .sort()
      .join("\n");
    if (recommendedPropsKeyRef.current === key) return;
    recommendedPropsKeyRef.current = key;
    setDisplayedRecommended(recommendedSources);
  }, [recommendedSources]);

  const typeCounts = useMemo(() => {
    const bag = { blogger: 0, media: 0, academic: 0 };
    for (const s of sources) {
      const t = (s.sourceType || "blogger") as "blogger" | "media" | "academic";
      bag[t]++;
    }
    return bag;
  }, [sources]);

  const toggleSection = (id: "blogger" | "media" | "academic") => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRefreshRecommended = useCallback(async () => {
    setIsRefreshingRecommended(true);
    try {
      const qs = new URLSearchParams({ limit: '2', random: '1' });
      const exclude = displayedRecommended.map((s) => s.id).filter(Boolean).join(',');
      if (exclude) qs.set('excludeIds', exclude);
      const response = await fetch(`/api/recommended-sources?${qs.toString()}`);
      const data = await response.json();
      if (data.success) {
        setDisplayedRecommended(data.sources);
      }
    } catch (error) {
      console.error('Failed to refresh recommended sources:', error);
    } finally {
      setIsRefreshingRecommended(false);
    }
  }, [displayedRecommended]);

  const filteredSubscribed = sources.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.handle.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  });

  const filteredRecommended = displayedRecommended.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.handle.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  });

  if (isCollapsed) {
    return null;
  }

  return (
    <div
      data-name="SOURCES (256*1024)"
      data-node-id="37:4552"
      className="group motion-layout-ease relative isolate mt-0 box-border flex h-full min-h-0 w-[256px] min-w-[256px] flex-col overflow-hidden bg-white py-6 pl-0 pr-3 transition-all"
    >
      {/* 37:4553 — 与稿一致 left 0.5px */}
      <div
        data-name="Horizontal Divider"
        data-node-id="37:4553"
        className="pointer-events-none absolute left-[0.5px] top-0 z-0 h-0.5 w-6 bg-[#0055FF]"
        aria-hidden
      />

      {/* 上半：仅 Title / Search / Subscribed 滚动；RECOMMEND 为根级下一兄弟，钉在栏底（稿面全高侧栏） */}
      <div className="sidebar-scroll relative z-[1] min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="box-border flex w-full min-w-0 flex-col">
        {/* 37:4554 Title · 37:4555 Heading 2 */}
        <div
          data-name="Title"
          data-node-id="37:4554"
          className="mb-0 flex h-6 w-full shrink-0 items-center justify-between"
        >
          <div data-name="Heading 2" data-node-id="37:4555" className="relative flex shrink-0 flex-col items-start">
            <h2 className="m-0 flex h-[18px] min-w-0 flex-col justify-center p-0 font-sans text-[12px] font-bold uppercase leading-[18px] tracking-[1.2px] text-[#111113]">
              信息源
            </h2>
          </div>
          <Tooltip content="添加信息源">
            <button
              type="button"
              data-name="Button"
              data-node-id="37:4557"
              onClick={() => (onAddSource ? onAddSource() : setShowAddModal(true))}
              className="flex size-4 shrink-0 items-center justify-center transition-opacity hover:opacity-70"
              aria-label="添加信息源"
            >
              <SourcesActionPlusGlyph
                className="size-[9.604px] shrink-0"
                data-node-id="37:4558"
              />
            </button>
          </Tooltip>
        </div>

        {/* Search Box 37:4560：稿 layout padding 12px 8px；与 Title 同属 4552 子级无 itemSpacing → 不设 mt */}
        <div
          data-name="Search Box"
          data-node-id="37:4560"
          className="z-[2] box-border flex min-h-[48px] w-full min-w-0 shrink-0 flex-row items-center justify-between px-2 py-3"
        >
          <div className="flex h-full w-full flex-row items-center self-stretch">
            <div className="flex h-full w-full shrink-0 flex-row items-center gap-[10px]">
              <span className="relative size-[12px] shrink-0 text-[#8A8A93]" data-name="Container" data-node-id="37:4562" aria-hidden>
                <SourcesSearchGlyph className="absolute inset-0 block size-full max-w-none" />
              </span>
              <input
                type="text"
                placeholder="搜索信息源…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-node-id="37:4567"
                className="min-w-0 flex-1 border-0 bg-transparent py-1 pl-2 text-[13px] font-normal leading-[normal] text-[#111113] outline-none ring-0 placeholder:text-[#8A8A93] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* 37:4568 Subscribed：与 Search 之间稿面无竖向 gap */}
        <div
          data-name="Subscribed"
          data-node-id="37:4568"
          className="relative z-[3] flex w-full min-w-0 flex-col items-start"
        >
          <div data-name="Nav" data-node-id="37:4569" className="flex w-full min-w-0 flex-col gap-2">
          {(
            [
              {
                id: "blogger" as const,
                label: "博主",
                sectionNode: "37:4570" as const,
                titleNode: "37:4571" as const,
                countNode: "37:4578" as const,
                chevronRightNode: "37:4630" as const,
              },
              {
                id: "media" as const,
                label: "媒体",
                sectionNode: "37:4621" as const,
                titleNode: "37:4622" as const,
                countNode: "37:4629" as const,
                chevronRightNode: "37:4630" as const,
              },
              {
                id: "academic" as const,
                label: "学术",
                sectionNode: "37:4632" as const,
                titleNode: "37:4633" as const,
                countNode: "37:4640" as const,
                chevronRightNode: "37:4641" as const,
              },
            ] as const
          ).map((section) => {
            const open = openSections[section.id];
            const list = filteredSubscribed.filter((s) => (s.sourceType || "blogger") === section.id);
            const count = typeCounts[section.id];
            return (
              <div key={section.id} data-name={section.label} data-node-id={section.sectionNode} className="flex w-full flex-col items-start">
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  data-name={section.id === "blogger" ? "title" : "Button"}
                  data-node-id={section.titleNode}
                  className="box-border flex min-h-10 w-full cursor-pointer items-center justify-between border-0 bg-transparent py-2 text-left"
                >
                  {/* 稿 37:4572：icon 与文字组 gap-8px；组内标题与 (n) 仅 pl-1（4px），避免多占横向 */}
                  <span className="flex min-w-0 items-center gap-2">
                    {section.id === "blogger" ? (
                      <span className="relative size-[12.351px] shrink-0 text-[#0055FF]" data-node-id="37:4573" aria-hidden>
                        <SourcesBloggersGlyph className="absolute inset-0 block size-full max-w-none" />
                      </span>
                    ) : section.id === "media" ? (
                      <span
                        className="relative h-[12.81px] w-[13.767px] shrink-0 text-[#0055FF]"
                        data-node-id="37:4624"
                        aria-hidden
                      >
                        <SourcesMediaGlyph className="absolute inset-0 block size-full max-w-none" />
                      </span>
                    ) : (
                      <span
                        className="relative h-[12.273px] w-[15.213px] shrink-0 text-[#0055FF]"
                        data-node-id="37:4635"
                        aria-hidden
                      >
                        <SourcesAcademiaGlyph className="absolute inset-0 block size-full max-w-none" />
                      </span>
                    )}
                    <span className="flex min-w-0 items-baseline gap-1">
                    <span
                      className="shrink-0 font-mono text-[11px] font-bold uppercase leading-[16.5px] tracking-[1.1px] text-[#0055FF]"
                      data-node-id={
                        section.id === "blogger"
                          ? "37:4575"
                          : section.id === "media"
                            ? "37:4626"
                            : "37:4637"
                      }
                    >
                      {section.label}
                    </span>
                    <span
                      className="shrink-0 pl-0 font-mono text-[11px] font-normal lowercase leading-[16.5px] tracking-[1.1px] text-[#8A8A93] tabular-nums"
                      data-node-id={section.countNode}
                    >
                      ({count})
                    </span>
                    </span>
                  </span>
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center text-[#8A8A93]"
                    aria-hidden
                  >
                    <span
                      className={[
                        "motion-layout-ease relative h-[7.223px] w-[4.54px] text-[#8A8A93] transition-transform",
                        open ? "rotate-90" : "rotate-0",
                      ].join(" ")}
                      data-node-id={open ? "37:4579" : section.chevronRightNode}
                    >
                      <SourcesChevronRightGlyph className="absolute inset-0 block size-full max-w-none" />
                    </span>
                  </span>
                </button>
                <div
                  className={[
                    "motion-layout-ease grid w-full transition-[grid-template-rows]",
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  ].join(" ")}
                >
                  <div className="min-h-0 overflow-hidden">
                    {list.length > 0 ? (
                      <div data-name="list" className="flex w-full flex-col gap-4 pb-0 pt-0">
                        {list.map((source, index) => (
                          <SourcesListSourceCard
                            key={source.handle}
                            source={source}
                            isSubscribed={subscribedIds.has(source.id)}
                            variant="subscribed"
                            currentSource={currentSource ?? ""}
                            onSourceSelect={(h) => onSourceSelect(h)}
                            avatarPriority={index < 6}
                            isFetching={!!fetchingSourceIds?.has(source.id)}
                          />
                        ))}
                      </div>
                    ) : open && !searchQuery ? (
                      <div className="py-1 text-[12px] font-normal text-[#8A8A93]">
                        暂无{section.label}类订阅。
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
        </div>
      </div>

        <RecommendPanel
          filteredRecommended={filteredRecommended}
          subscribedIds={subscribedIds}
          isRefreshingRecommended={isRefreshingRecommended}
          onRefresh={handleRefreshRecommended}
          onSourceSelect={(h) => onSourceSelect(h)}
          onToggleSubscription={onToggleSubscription}
          currentSource={currentSource ?? ""}
        />

      <AddSourceModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
