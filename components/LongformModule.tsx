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

function getSourceLabel(post: LongformPost): string {
  const sourceName = post.longform.sourceName?.trim();
  const authorName = getArticleAuthor(post).trim();
  if (!sourceName || sourceName === authorName) return "";
  return sourceName;
}

function formatWordCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  if (count >= 1000) {
    return `${Math.round(count / 100) / 10}k words`;
  }
  return `${count} words`;
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
          暂无优质长文
        </h2>
        <p className="m-0 mt-2 text-[13px] leading-5 text-[#6a7282]">
          抓取到博客或媒体长文链接后，系统会自动读取原文并把译文存到这里。
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="优质长文"
      data-name="Premium longform"
      className="w-full min-w-0 border-y border-[#f3f4f6] py-6"
    >
      <div className="mb-5 flex min-w-0 items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="m-0 font-mono text-[11px] font-bold uppercase leading-4 text-[#d7a220]">
            LONGFORM
          </p>
          <h2 className="m-0 mt-1 text-[16px] font-semibold leading-6 text-[#101828]">
            优质长文
          </h2>
          <p className="m-0 mt-1 text-[12px] leading-[18px] text-[#6a7282]">
            已读取原文并翻译，按文章阅读，不混入普通信息流。
          </p>
        </div>
        <span className="shrink-0 font-mono text-[12px] font-medium leading-[18px] text-[#99a1af]">
          {longformPosts.length} 篇
        </span>
      </div>

      <div className="flex w-full min-w-0 flex-col divide-y divide-[#f3f4f6]">
        {longformPosts.map((post) => {
          const article = post.longform;
          const paragraphs = getParagraphs(article.translatedContent);
          const title = getArticleTitle(post);
          const author = getArticleAuthor(post);
          const sourceLabel = getSourceLabel(post);
          const wordCount = formatWordCount(article.originalWordCount);
          const articleKey = getArticleKey(post);
          const isOpen = openKey === articleKey;

          return (
            <article
              key={articleKey}
              className="min-w-0 py-3 first:pt-0 last:pb-0"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                aria-label={`${isOpen ? "收起" : "展开"}：${title}`}
                onClick={() => setOpenKey(isOpen ? null : articleKey)}
                className="group flex w-full cursor-pointer items-start gap-3 rounded-[4px] px-2 py-3 text-left outline-none transition-colors hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-primary-500/30"
              >
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d7a220]" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 truncate text-[12px] font-medium leading-[18px] text-[#101828]">
                      {formatTypography(author)}
                    </span>
                    {sourceLabel ? (
                      <>
                        <span className="font-mono text-[11px] leading-4 text-[#d1d5db]" aria-hidden>
                          /
                        </span>
                        <span className="min-w-0 truncate font-mono text-[11px] leading-4 text-[#99a1af]">
                          {formatTypography(sourceLabel)}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <h3 className="m-0 line-clamp-2 break-words text-[17px] font-semibold leading-6 text-[#101828]">
                    {formatTypography(title)}
                  </h3>
                  <p className="m-0 mt-1 line-clamp-2 break-words text-[13px] leading-5 text-[#6a7282]">
                    {formatTypography(article.excerpt)}
                  </p>
                </div>
                <span
                  className={[
                    "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[#99a1af] transition-transform",
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
                <div className="mt-2 rounded-[4px] border-l-2 border-[#d7a220] bg-[#fcfcfd] px-4 py-3 sm:px-5">
                  <div className="flex flex-col gap-3 text-[14px] leading-6 text-[#101828]">
                    {paragraphs.map((paragraph, paragraphIndex) => (
                      <p key={paragraphIndex} className="m-0 break-words">
                        {formatTypography(paragraph)}
                      </p>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[#f3f4f6] pt-3 text-[12px] leading-[18px]">
                    <span className="font-mono text-[#99a1af]">
                      {wordCount || "已翻译"}
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
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
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
