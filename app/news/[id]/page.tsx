import { getPostById } from '@/lib/db';

export const revalidate = 3600;

export default async function NewsDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const post = await getPostById(params.id);

  if (!post) {
    return (
      <main className="min-h-screen bg-[#f5f5f5] px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-200 rounded-md border border-[#f3f4f6] bg-white p-6 shadow-sm">
          <h1 className="m-0 text-xl font-semibold text-[#101828]">新闻不存在</h1>
          <p className="mt-2 text-sm text-[#6a7282]">这篇内容可能已被删除或暂时不可访问。</p>
        </div>
      </main>
    );
  }

  const sourceName = post.source.name;
  const sourceUrl = post.source.url;
  const categoryZh = post.category;
  const canOpenSource = /^https:\/\//i.test(sourceUrl);

  return (
    <main className="min-h-screen bg-[#f5f5f5] px-4 py-8 sm:px-6 sm:py-10">
      <article className="mx-auto max-w-200 rounded-md border border-[#f3f4f6] bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] leading-5 text-[#6a7282]">
          <span className="font-semibold text-primary-500"># {categoryZh}</span>
          <span aria-hidden>/</span>
          <span>{sourceName}</span>
          <span aria-hidden>/</span>
          <time dateTime={post.publishedAt} className="tabular-nums">
            {new Date(post.publishedAt).toLocaleString("zh-CN")}
          </time>
        </div>

        <h1 className="m-0 text-[28px] font-bold leading-9 tracking-[-0.5px] text-[#101828] sm:text-[32px] sm:leading-10">
          {post.title}
        </h1>

        <p className="mt-6 text-[17px] leading-8 text-[#52525b]">
          {post.summary}
        </p>

        <div className="mt-8 whitespace-pre-wrap text-[16px] leading-8 text-[#101828]">
          {post.content}
        </div>

        {canOpenSource ? (
          <div className="mt-8 border-t border-[#e5e7eb] pt-5">
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press inline-flex h-9 items-center rounded-md bg-primary-500 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-600"
            >
              查看原推文
            </a>
          </div>
        ) : null}
      </article>
    </main>
  );
}
