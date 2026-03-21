import { getPostById } from '@/lib/db';
import { NewsItem } from '@/lib/types';

export const revalidate = 3600;

export default async function NewsDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const post = await getPostById(params.id);

  if (!post) {
    return (
      <main style={{ maxWidth: "800px", margin: "40px auto", padding: "0 20px" }}>
        <h1>新闻不存在</h1>
      </main>
    );
  }

  const sourceName = post.source.name;
  const sourceUrl = post.source.url;

  return (
    <main style={{ maxWidth: "800px", margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: "32px", marginBottom: "20px" }}>{post.title}</h1>

      <div style={{ fontSize: "14px", color: "#666", marginBottom: "20px" }}>
        来源：{sourceName} ｜ 分类：{post.category} ｜ 时间：
        {new Date(post.publishedAt).toLocaleString("zh-CN")}
      </div>

      <p style={{ fontSize: "18px", lineHeight: "1.8", marginBottom: "24px" }}>
        {post.summary}
      </p>

      <div style={{ fontSize: "16px", lineHeight: "1.8", whiteSpace: "pre-wrap" }}>
        {post.content}
      </div>

      <div style={{ marginTop: "32px" }}>
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
          查看原推文
        </a>
      </div>
    </main>
  );
}