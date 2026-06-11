"use client";

import { useEffect, useMemo, useState } from "react";
import type { NewsItem } from "@/lib/types";
import { formatTypography } from "@/lib/utils";

type LongformPost = NewsItem & { longform: NonNullable<NewsItem["longform"]> };

type LongformModuleProps = {
  posts: NewsItem[];
};

function getLongformPosts(posts: NewsItem[]): LongformPost[] {
  const seenUrls = new Set<string>();
  const out: LongformPost[] = [];

  for (const post of posts) {
    if (!post.longform?.translatedContent) continue;

    const key = (post.longform.resolvedUrl || post.longform.url).trim().toLowerCase();
    if (!key || seenUrls.has(key)) continue;

    seenUrls.add(key);
    out.push(post as LongformPost);
  }

  return out;
}

function getArticleKey(post: LongformPost): string {
  return (post.longform.resolvedUrl || post.longform.url || post.id).trim().toLowerCase();
}

function getArticleTitle(post: LongformPost): string {
  return post.longform.translatedTitle || post.longform.title || post.title;
}

function getArticleAuthor(post: LongformPost): string {
  return post.longform.authorName || post.source.name || post.source.handle || "未知作者";
}

function getCategoryTag(category: NewsItem["category"]) {
  return category || "行业";
}

function formatDateZH(dateString: string): string {
  const d = new Date(dateString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function formatTimeLocalHM(dateString: string): string {
  const d = new Date(dateString);
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

function getParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export default function LongformModule({ posts }: LongformModuleProps) {
  const longformPosts = useMemo(() => getLongformPosts(posts), [posts]);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    setOpenKey((current) => {
      if (current && longformPosts.some((post) => getArticleKey(post) === current)) {
        return current;
      }
      return longformPosts[0] ? getArticleKey(longformPosts[0]) : null;
    });
  }, [longformPosts]);

  if (longformPosts.length === 0) {
    return (
      <section
        aria-label="优质长文"
        data-name="Premium longform"
        className="w-full min-w-0 border-y border-[#f3f4f6] py-16 text-center"
      >
        <h2 className="m-0 text-[16px] font-semibold leading-6 text-[#101828]">
          暂无长文
        </h2>
        <p className="m-0 mt-2 text-[13px] leading-5 text-[#6a7282]">
          抓取到博客或媒体长文链接后，会在这里展示译文。
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="优质长文"
      data-name="Premium longform"
      className="w-full min-w-0 border-y border-[#f3f4f6]"
    >
      <div className="flex w-full min-w-0 flex-col divide-y divide-[#f3f4f6]">
        {longformPosts.map((post, index) => {
          const article = post.longform;
          const paragraphs = getParagraphs(article.translatedContent);
          const title = getArticleTitle(post);
          const author = getArticleAuthor(post);
          const articleKey = getArticleKey(post);
          const isOpen = openKey === articleKey;

          return (
            <article
              key={articleKey}
              className="min-w-0 py-8 sm:py-10"
            >
              <div className="flex min-w-0 gap-5 sm:gap-6">
                <div
                  className="w-8 shrink-0 pt-px text-right font-mono text-[12px] font-semibold leading-[18px] tabular-nums text-[#d7a220]"
                  aria-hidden
                >
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? "收起" : "展开"}：${title}`}
                    onClick={() => setOpenKey(isOpen ? null : articleKey)}
                    className="group flex w-full cursor-pointer items-start justify-between gap-4 rounded-[2px] text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-4 flex min-w-0 flex-wrap items-center gap-[4px]">
                        <span className="flex min-h-[18px] shrink-0 items-center font-mono text-[12px] font-bold leading-[18px] text-[#05f]">
                          # {getCategoryTag(post.category)}
                        </span>
                        <span className="flex min-h-[18px] items-center font-mono text-[12px] font-normal leading-[18px] text-[rgba(161,161,170,0.5)]" aria-hidden>
                          /
                        </span>
                        <span className="flex min-h-[18px] min-w-0 items-center font-mono text-[12px] font-normal leading-[18px] text-[#8a8a93]">
                          {formatTypography(author)}
                        </span>
                        <span className="flex min-h-[18px] items-center font-mono text-[12px] font-normal leading-[18px] text-[rgba(161,161,170,0.5)]" aria-hidden>
                          /
                        </span>
                        <span className="flex min-h-[18px] min-w-0 items-center tabular-nums font-mono text-[12px] font-normal leading-[18px] text-[#8a8a93]">
                          {formatDateZH(post.publishedAt)}
                        </span>
                        <span className="flex min-h-[18px] items-center font-mono text-[12px] font-normal leading-[18px] text-[rgba(161,161,170,0.5)]" aria-hidden>
                          /
                        </span>
                        <span className="flex min-h-[18px] items-center tabular-nums font-mono text-[12px] font-normal leading-[18px] text-[#8a8a93]">
                          {formatTimeLocalHM(post.publishedAt)}
                        </span>
                      </div>
                      <h3 className="m-0 line-clamp-2 break-words font-sans text-[22px] font-bold leading-[30px] text-[#18181b]">
                        {formatTypography(title)}
                      </h3>
                      <p className="m-0 mt-4 line-clamp-2 break-words font-sans text-[14px] font-normal leading-[22px] text-[#52525b]">
                        {formatTypography(article.excerpt)}
                      </p>
                    </div>
                    <span
                      className={[
                        "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[#99a1af] transition-transform group-hover:text-[#101828]",
                        isOpen ? "rotate-180" : "",
                      ].join(" ")}
                      aria-hidden
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="mt-6 rounded-[2px] border border-[#f3f4f6] bg-[#fcfcfd] px-4 py-4 sm:px-5">
                      <div className="flex flex-col gap-3 text-[14px] leading-6 text-[#101828]">
                        {paragraphs.map((paragraph, paragraphIndex) => (
                          <p key={paragraphIndex} className="m-0 break-words">
                            {formatTypography(paragraph)}
                          </p>
                        ))}
                      </div>
                      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#f3f4f6] pt-3 text-[12px] leading-[18px]">
                        <a
                          href={article.resolvedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary-600 transition-colors hover:text-primary-700"
                        >
                          阅读原文
                        </a>
                        <a
                          href={post.source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[#6a7282] transition-colors hover:text-[#101828]"
                        >
                          来源推文
                        </a>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
