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

function getParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 12);
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
        <h2 className="m-0 text-[16px] font-semibold leading-6 tracking-[-0.25px] text-[#101828]">
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
      className="w-full min-w-0 border-y border-[#f3f4f6] py-5"
    >
      <div className="mb-4 flex min-w-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] bg-[#fff8e6] text-[#d7a220]">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 4h7l3 3v13H7z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 4v4h4" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6M9 16h6" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 className="m-0 text-[15px] font-semibold leading-6 tracking-[-0.2px] text-[#101828]">
              优质长文
            </h2>
            <p className="m-0 text-[12px] leading-[18px] text-[#6a7282]">
              已自动抓取、翻译并存储的原文文章
            </p>
          </div>
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
          const articleKey = getArticleKey(post);
          const isOpen = openKey === articleKey;

          return (
            <article
              key={articleKey}
              className="min-w-0 py-4 first:pt-0 last:pb-0"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenKey(isOpen ? null : articleKey)}
                className="group flex w-full cursor-pointer items-start justify-between gap-4 rounded-[4px] text-left outline-none transition-colors hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-primary-500/30"
              >
                <div className="min-w-0 px-2 py-1">
                  <div className="mb-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-[#d7a220]">
                      【优质长文】
                    </span>
                    <span className="font-mono text-[11px] leading-4 text-[#99a1af]">
                      {formatTypography(article.sourceName)}
                    </span>
                    <span className="font-mono text-[11px] leading-4 text-[#99a1af]">
                      {Math.max(1, Math.round(article.originalWordCount / 1000))}k words
                    </span>
                  </div>
                  <h3 className="m-0 line-clamp-2 break-words text-[16px] font-semibold leading-6 tracking-[-0.25px] text-[#101828]">
                    {formatTypography(title)}
                  </h3>
                  <p className="m-0 mt-1 line-clamp-2 break-words text-[13px] leading-5 text-[#6a7282]">
                    {formatTypography(article.excerpt)}
                  </p>
                </div>
                <span
                  className={[
                    "mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[#99a1af] transition-transform",
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
                <div className="mt-3 max-h-[520px] overflow-y-auto rounded-[4px] border border-[#f3f4f6] bg-[#fcfcfd] px-4 py-3">
                  <div className="flex flex-col gap-3 text-[14px] leading-6 text-[#101828]">
                    {paragraphs.map((paragraph, paragraphIndex) => (
                      <p key={paragraphIndex} className="m-0 break-words">
                        {formatTypography(paragraph)}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-3 px-2 text-[12px] leading-[18px]">
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
            </article>
          );
        })}
      </div>
    </section>
  );
}
