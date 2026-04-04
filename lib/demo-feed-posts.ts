import type { NewsItem } from "./types";

/** 与默认订阅占位 handles 对齐，仅作空 Feed 展示 */
const DEMO_BY_HANDLE: Record<string, NewsItem> = {
  karpathy: {
    id: "uai-demo-karpathy-1",
    title:
      "Notes on scaling multimodal training: compute budget vs. data mix at long context.",
    summary:
      "Short write-up on practical trade-offs when mixing vision and language batches—where diminishing returns show up first and what we monitor in telemetry.",
    content:
      "Example body: telemetry, loss curves, and data mixture experiments (demo content for uAI News).",
    source: {
      platform: "X",
      name: "Andrej Karpathy",
      handle: "karpathy",
      url: "https://twitter.com/karpathy/status/uai-demo-1",
    },
    category: "Research",
    publishedAt: "2026-03-29T15:30:00.000Z",
    originalText: "Demo sample post for default subscription preview.",
    createdAt: "2026-03-29T15:35:00.000Z",
    importanceScore: 82,
  },
  sama: {
    id: "uai-demo-sama-1",
    title: "Shipping velocity, safety reviews, and rolling out model updates at scale.",
    summary:
      "How we sequence staged rollouts, red-team checkpoints, and partner feedback before broad release—demo placeholder mirroring a typical company update.",
    content:
      "Example body: rollout phases and internal review gates (demo content for uAI News).",
    source: {
      platform: "X",
      name: "Sam Altman",
      handle: "sama",
      url: "https://twitter.com/sama/status/uai-demo-1",
    },
    category: "Company News",
    publishedAt: "2026-03-28T18:00:00.000Z",
    originalText: "Demo sample post for default subscription preview.",
    createdAt: "2026-03-28T18:05:00.000Z",
    importanceScore: 88,
  },
  ylecun: {
    id: "uai-demo-ylecun-1",
    title: "Self-supervised objectives still generalize better than we expect on held-out reasoning tasks.",
    summary:
      "Counter-intuitive result from a controlled sweep: JEPA-style targets hold up on small reasoning evals without task-specific finetuning (illustrative demo text).",
    content:
      "Example body: experimental setup and limitations (demo content for uAI News).",
    source: {
      platform: "X",
      name: "Yann LeCun",
      handle: "ylecun",
      url: "https://twitter.com/ylecun/status/uai-demo-1",
    },
    category: "Research",
    publishedAt: "2026-03-27T12:15:00.000Z",
    originalText: "Demo sample post for default subscription preview.",
    createdAt: "2026-03-27T12:20:00.000Z",
    importanceScore: 76,
  },
};

/**
 * DB / 抓取无数据时，按当前订阅 handles 顺序插入对应示例帖（每个 handle 最多一条）。
 */
export function mergeDemoPostsIfFeedEmpty(feed: NewsItem[], handles: string[]): NewsItem[] {
  if (feed.length > 0) return feed;

  const normalized = handles.map((h) => h.trim().toLowerCase()).filter(Boolean);
  const out: NewsItem[] = [];

  for (const h of normalized) {
    const post = DEMO_BY_HANDLE[h];
    if (post) out.push(post);
  }

  return out;
}
