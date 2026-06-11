"use client";

import { useState, useMemo } from "react";
import SourceAvatarImg from "./SourceAvatarImg";
import type { AuthUser } from "@/lib/auth";
type User = AuthUser;
import Tooltip from "./Tooltip";
import { sourceBioTagsLine } from "@/lib/source-bio-fallback";
import { defaultAvatarUrlForHandle } from "@/lib/source-avatar";
import { resolveSourceHomeUrl } from "@/lib/source-home-url";
import { resolveSourceProfile } from "@/lib/source-profile";
import {
  SourcesAcademiaGlyph,
  SourcesActionPlusGlyph,
  SourcesBloggersGlyph,
  SourcesChevronRightGlyph,
  SourcesMediaGlyph,
  SourcesSearchGlyph,
} from "@/components/sources-sidebar-icons";

type Source = {
  handle: string;
  name: string;
  url?: string;
  avatar?: string;
  description?: string;
  postCount: number;
  latestPostTime?: string;
  id: string;
  sourceType?: 'blogger' | 'media' | 'academic';
};

type SourcesListProps = {
  sources: Source[];              // 已订阅的信息源
  currentSource?: string;
  onSourceSelect: (handle?: string) => void;
  onAddSource?: () => void;
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
  currentSource: string;
  onSourceSelect: (handle: string) => void;
  avatarPriority?: boolean;
  isFetching?: boolean;
};

function SourcesListSourceCard({
  source,
  currentSource,
  onSourceSelect,
  avatarPriority = false,
  isFetching = false,
}: SourcesListSourceCardProps) {
  const profile = resolveSourceProfile({
    handle: source.handle,
    platform: "X",
    avatar: source.avatar,
    description: source.description,
  });
  const sourceHomeUrl = resolveSourceHomeUrl(source);
  const bioTagsLine = sourceBioTagsLine(profile.description, source.handle);
  const rowActive = isSourceRowActive(source.handle, currentSource);

  return (
    <Tooltip content={`点击筛选 ${source.name} 的推文`} excludeSelector="[data-tooltip-exclude]">
      <div
        className={[
          "group/source-row motion-layout-ease relative box-border flex w-full shrink-0 items-start gap-3 rounded-[2px] border border-solid border-transparent px-px py-[9px] text-left transition-colors",
          rowActive ? "bg-[#f7f9fc]" : "hover:bg-[#f9fafb]/80",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => onSourceSelect(source.handle)}
          aria-pressed={rowActive}
          className="absolute inset-0 z-0 cursor-pointer rounded-[2px] border-0 bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30 focus-visible:ring-offset-2"
          aria-label={`筛选 ${source.name} 的推文`}
        />
        <Tooltip content={`打开 ${source.name} 主页`}>
          <a
            href={sourceHomeUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-tooltip-exclude=""
            className="btn-press relative z-[1] shrink-0 rounded-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30 focus-visible:ring-offset-2"
            aria-label={`打开 ${source.name} 主页`}
          >
            <SourceAvatarImg
              src={profile.avatar}
              fallbackSrc={defaultAvatarUrlForHandle(source.handle)}
              alt={source.name}
              letter={source.name}
              imgClassName="h-8 w-8 flex-shrink-0 rounded-[2px] object-cover"
              placeholderClassName="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[2px] bg-gray-200 text-[12px] font-semibold text-[#6a7282]"
              priority={avatarPriority}
            />
          </a>
        </Tooltip>
        <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col items-stretch gap-1">
          <div className="flex min-h-[13px] items-center justify-between gap-2 self-stretch">
            <Tooltip content={`打开 ${source.name} 主页`}>
              <a
                href={sourceHomeUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-tooltip-exclude=""
                className="min-w-0 truncate rounded-[3px] text-[12px] font-medium leading-4 text-[#111113] transition-colors hover:text-[#0055FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30"
                aria-label={`打开 ${source.name} 主页`}
              >
                {source.name}
              </a>
            </Tooltip>
            <div className="flex min-h-px min-w-0 flex-shrink-0 items-center justify-end gap-2">
              <Tooltip content={isFetching ? "正在抓取推文" : "已收录推文数"}>
                <span
                  className="inline-flex min-w-[1em] cursor-default items-center justify-center gap-1 font-mono text-[12px] font-medium tabular-nums leading-4 text-[#0055FF]"
                  data-tooltip-exclude=""
                >
                  {isFetching ? (
                    <>
                      <span
                        className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-[#0055FF] border-t-transparent"
                        aria-hidden
                      />
                      <span className="text-[10px] leading-4">抓取中</span>
                    </>
                  ) : (
                    source.postCount
                  )}
                </span>
              </Tooltip>
            </div>
          </div>
          <div className="min-h-[17px] w-full text-[12px] font-normal leading-5 text-[#8A8A93]">
            @{source.handle}
          </div>
          <p className="m-0 min-h-[20px] w-full min-w-0 truncate text-left text-[12px] font-normal leading-5 text-[#666666]">
            {bioTagsLine}
          </p>
        </div>
      </div>
    </Tooltip>
  );
}

export default function SourcesList({
  sources,
  currentSource,
  onSourceSelect,
  onAddSource,
  fetchingSourceIds,
  user,
  isCollapsed,
  onToggleCollapse,
}: SourcesListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [openSections, setOpenSections] = useState<Record<"blogger" | "media" | "academic", boolean>>({
    blogger: true,
    media: false,
    academic: false,
  });

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

  const filteredSubscribed = sources.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.handle.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  });
  const fetchingCount = fetchingSourceIds?.size ?? 0;

  if (isCollapsed) {
    return null;
  }

  return (
    <div
      data-name="SOURCES (256*1024)"
      data-node-id="37:4552"
      className="group motion-layout-ease relative isolate mt-0 box-border flex h-full min-h-0 w-[256px] min-w-[256px] flex-col overflow-hidden bg-white py-6 pl-0 pr-3 transition-[transform,opacity]"
    >
      {/* 37:4553 — 与稿一致 left 0.5px */}
      <div
        data-name="Horizontal Divider"
        data-node-id="37:4553"
        className="pointer-events-none absolute left-[0.5px] top-0 z-0 h-0.5 w-6 bg-[#0055FF]"
        aria-hidden
      />

      <div className="sidebar-scroll relative z-[1] min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="box-border flex w-full min-w-0 flex-col">
        {/* 37:4554 Title · 37:4555 Heading 2 */}
        <div
          data-name="Title"
          data-node-id="37:4554"
          className="mb-0 flex h-6 w-full shrink-0 items-center justify-between"
        >
          <div data-name="Heading 2" data-node-id="37:4555" className="relative flex shrink-0 flex-col items-start">
            <h2 className="m-0 flex h-[19.5px] min-w-0 flex-col justify-center p-0">
              <Tooltip content="显示全部信息源推文">
                <button
                  type="button"
                  onClick={() => onSourceSelect(undefined)}
                  aria-pressed={!currentSource}
                  className="btn-press rounded-[3px] font-sans text-[13px] font-bold uppercase leading-[19.5px] tracking-[1.2px] text-[#111113] transition-colors hover:text-[#0055FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30"
                >
                  信息源
                </button>
              </Tooltip>
            </h2>
          </div>
          <Tooltip content="添加信息源">
            <button
              type="button"
              data-name="Button"
              data-node-id="37:4557"
              onClick={() => onAddSource?.()}
              className="btn-press flex size-8 shrink-0 items-center justify-center rounded-md transition-[background-color,opacity] hover:bg-[#f3f4f6] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30"
              aria-label="添加信息源"
            >
              <SourcesActionPlusGlyph
                className="size-3.5 shrink-0"
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
                name="sourceSearch"
                aria-label="搜索信息源"
                autoComplete="off"
                spellCheck={false}
                placeholder="搜索信息源…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-node-id="37:4567"
                className="min-w-0 flex-1 rounded-[3px] border-0 bg-transparent py-1 pl-2 text-[13px] font-normal leading-[normal] text-[#111113] outline-none ring-0 placeholder:text-[#8A8A93] focus-visible:bg-[#f7f9fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/25"
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
                  aria-expanded={open}
                  aria-controls={`sources-section-${section.id}`}
                  data-name={section.id === "blogger" ? "title" : "Button"}
                  data-node-id={section.titleNode}
                  className="box-border flex min-h-10 w-full cursor-pointer items-center justify-between rounded-[3px] border-0 bg-transparent py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30"
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
                      className="shrink-0 font-mono text-[13px] font-bold uppercase leading-[19.5px] tracking-[1.1px] text-[#0055FF]"
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
                      className="shrink-0 pl-0 font-mono text-[12px] font-normal lowercase leading-[18px] tracking-[0.02em] text-[#8A8A93] tabular-nums"
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
                  id={`sources-section-${section.id}`}
                  className={[
                    "motion-collapse-grid w-full",
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
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {fetchingCount > 0 ? `${fetchingCount} 个信息源正在抓取新内容` : ""}
        </span>
        </div>
      </div>
    </div>
  );
}
