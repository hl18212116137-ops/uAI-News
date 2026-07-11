import "server-only";

import { unstable_cache } from "next/cache";
import {
  getPersistedInsightForRead,
  mergeInsightGlobalPayload,
  normalizeNewsItemId,
} from "@/lib/db/news";
import { computeInsightAnalysis, type InsightAnalysisPayload } from "@/lib/post-insight-compute";
import { consumeAnalysisRateLimit, getClientRateLimitKey } from "@/lib/analysis-rate-limit";
import { isDemoPostId, getDemoPostById } from "@/lib/demo-feed-posts";

/** INSIGHT 全局一份：按 postId 缓存；与订阅无关 */
const INSIGHT_CACHE_REVALIDATE_SEC = 60 * 60 * 24;

export type PostInsightServiceResult =
  | { kind: "success"; analysis: InsightAnalysisPayload }
  | { kind: "not_found" }
  | { kind: "bad_request"; error: string }
  | { kind: "rate_limited"; error: string; retryAfterSec: number }
  | { kind: "server_error"; error: string };

import type { NewsItem } from "@/lib/types";

/** Demo posts: 生成占位 INSIGHT（无需 AI / DB） */
function buildDemoInsightPayload(post: NewsItem): InsightAnalysisPayload {
  return {
    scores: post.importanceScore ?? 75,
    reliability: 80,
    review: [
      `此条内容为 ${post.source.name} 的示例展示帖，用于演示解读面板功能。`,
      "连接数据库并抓取真实帖子后，此处将展示 AI 生成的要点摘要。",
    ],
    originalTranslation: post.originalText || null,
    originalTranslationReferenced: null,
  };
}

const SEED_INSIGHTS: Record<string, InsightAnalysisPayload> = {
  "seed-karpathy-1": {
    scores: 88, reliability: 85,
    review: [
      "三种加速技巧一起用，大模型回答问题能快 **3.2 倍**，准确率几乎不掉",
      "这三招的效果是**互相翻倍**的，单独测一种会低估实际威力",
      "「猜答案」用的小模型大小要合适，太小猜不准，太大省不了时间",
    ],
    originalTranslation: "关于 LLM 推理优化的系列讨论：我们在 7 个模型系列上对 INT4 量化 + 投机解码 + KV 缓存压缩进行了基准测试。三者组合可实现 3.2 倍加速，精度损失低于 0.5%。关键在于草稿模型的容量要匹配目标模型——太小则投机接受率低于 60%，太大则失去延迟优势。通过分组查询注意力 + 滑动窗口的 KV 缓存压缩在此基础上再提升 1.4 倍。完整数据见下方回复。核心发现：三种技术的效果大致是乘法叠加而非加法。大多数论文单独评测，低估了组合收益。",
    originalTranslationReferenced: null,
  },
  "seed-sama-1": {
    scores: 95, reliability: 90,
    review: [
      "**GPT-5** 不会一下子全放出来，先给安全专家测，再逐步开放",
      "新模型**更会推理**，也能同时处理文字、图片等多种信息",
      "OpenAI 的态度：先让安全圈把关，再给大家用",
    ],
    originalTranslation: "分享一些关于我们模型发布时间线的更新。我们对 GPT-5 采取分阶段发布方式：首先向安全研究合作伙伴开放进行红队测试和评估，然后逐步向开发者和公众扩展。该模型在推理、多模态理解和指令遵循方面展现出显著改进。我们认为负责任的部署意味着在大规模发布前给安全社区足够的时间来评估模型能力。",
    originalTranslationReferenced: null,
  },
  "seed-ylecun-1": {
    scores: 82, reliability: 80,
    review: [
      "不用专门教，模型自己学也能学会推理，12 项测试里 **8 项**追平或超过了专门训练的",
      "这说明「想让 AI 会推理就得专门训练」这个老观念**可能不对**",
    ],
    originalTranslation: "来自受控实验的意外结果：JEPA 风格的自监督目标在保留的推理基准上表现出色——无需任何任务特定微调。我们在 12 项不同难度的推理评测中进行了测试。仅用自监督目标训练的模型在 12 项中的 8 项上匹配或超过了监督基线。这挑战了当前认为推理能力需要显式监督训练的主流观点。",
    originalTranslationReferenced: null,
  },
  "seed-openai-1": {
    scores: 90, reliability: 88,
    review: [
      "ChatGPT 现在**边搜边答**，每句话都附上来源链接，可以点进去验证",
      "**Plus 和 Team** 用户已经能用，企业版下周开放",
    ],
    originalTranslation: "ChatGPT 现已支持带内联引用的实时搜索。当你提出问题时，模型会自动搜索网络并在回答中提供可验证的来源链接。今天面向所有 Plus 和 Team 用户推出。Enterprise 和 Edu 版本下周跟进。我们还改进了引用格式——每个依赖外部来源的观点都会获得一个可点击验证的编号引用。",
    originalTranslationReferenced: null,
  },
  "seed-anthropic-1": {
    scores: 92, reliability: 87,
    review: [
      "Claude 写代码能力刷新纪录，**SWE-bench 解决率 72.1%**",
      "能一口气处理 **20 万字**的超长内容，数学推理也大幅进步",
    ],
    originalTranslation: "Claude 在 SWE-bench（72.1% 解决率）和 4 项主要数学推理基准上创下新的最佳成绩。关键改进：扩展上下文处理能力至 200K token 并保持准确性，显著提升的代码生成和调试能力，以及改进的多步骤数学推理。我们同时发布了详细说明训练方法和安全评估的技术报告。今天起面向所有 API 用户开放。",
    originalTranslationReferenced: null,
  },
  "seed-deepmind-1": {
    scores: 85, reliability: 82,
    review: [
      "**AlphaFold 3** 代码开源了，不光能预测蛋白质结构，还能预测药物分子怎么跟蛋白质结合",
      "模型权重后续也会放出来，对做新药研发的帮助很大",
    ],
    originalTranslation: "AlphaFold 3 推理代码现已开源。新版本超越了蛋白质结构预测，可建模蛋白质-小分子相互作用、蛋白质-DNA/RNA 复合体和翻译后修饰。我们相信开源推理流水线将加速药物发现和生物学研究。模型权重和训练代码将随后发布。",
    originalTranslationReferenced: null,
  },
  "seed-hf-1": {
    scores: 78, reliability: 75,
    review: [
      "模型排行榜大改版，新增了**听不听话**、多轮聊天、会不会用工具等实用维度",
      "加了真人校准，评分更贴近实际使用感受；还能检测模型是不是**背过答案**",
    ],
    originalTranslation: "推出 Open LLM Leaderboard v3。主要变化：新增指令遵循、多轮对话和工具使用等评测维度；引入人工校准机制使自动评分与真实使用对齐；新增污染检测以标记可能被记忆的基准测试。我们评估了 847 个模型。",
    originalTranslationReferenced: null,
  },
  "seed-dario-1": {
    scores: 80, reliability: 78,
    review: [
      "Anthropic 让模型「少说坏话」的技术升级了，有害回复减少 **4 倍**还不影响好用程度",
      "能找到模型里**负责撒谎的那根「神经」**了，这是个大突破",
    ],
    originalTranslation: "回顾我们的 AI 安全研究路线图。过去一年 Anthropic 在三个方面取得了进展：Constitutional AI 改进使有害输出减少 4 倍同时保持有用性；机制可解释性突破使我们能够识别导致欺骗行为的特定回路；以及针对在狭窄领域超越人类能力的模型的可扩展监督技术。",
    originalTranslationReferenced: null,
  },
  "seed-elonmusk-1": {
    scores: 86, reliability: 80,
    review: [
      "**Grok 3** 快来了，能看图、能实时搜索，跟 X 平台深度打通",
      "内部测试显示跟最强的闭源模型**不相上下**，下月开放 Beta 测试",
    ],
    originalTranslation: "Grok 3 即将推出，具备多模态能力和与 X 深度集成的实时信息检索功能。该模型在标准基准上展现出与顶级闭源模型相当的性能。视觉理解、实时网页搜索和原生 X 平台集成是关键差异化特性。内部测试在编程和推理任务上均表现出色。Beta 访问下月开放。",
    originalTranslationReferenced: null,
  },
  "seed-ilya-1": {
    scores: 84, reliability: 82,
    review: [
      "现在让 AI 听话的方法，等 AI 变得**特别聪明以后可能就不管用**了",
      "需要能**数学证明** AI 是安全的，而不只是「试了感觉还行」",
      "安全措施不能越加越拖速度，必须越来越轻量",
    ],
    originalTranslation: "关于安全超级智能核心挑战的思考。当前对齐技术可能无法扩展到能力显著超越人类的模型。我们需要可证明安全的方法——对齐属性的形式化验证、行为边界的数学保证，以及随能力扩展的可解释性。对齐税（安全性的性能成本）必须随规模下降而非上升。我们新的研究方向聚焦于这三大支柱。",
    originalTranslationReferenced: null,
  },
};

function isSeedPostId(id: string): boolean {
  return typeof id === "string" && id.startsWith("seed-");
}

/** 同一 post 并发 POST 只跑一次限流 + 一次 AI（Strict Mode / 快速重试共用结果） */
const insightComputeCoalesce = new Map<string, Promise<PostInsightServiceResult>>();

async function runInsightComputeOnce(
  normalizedPostId: string,
  request: Request,
): Promise<PostInsightServiceResult> {
  try {
    const fromDb2 = await getPersistedInsightForRead(normalizedPostId);
    if (fromDb2) {
      return { kind: "success", analysis: fromDb2 };
    }

    const limitKey = getClientRateLimitKey(request);
    const limited = consumeAnalysisRateLimit(limitKey);
    if (!limited.ok) {
      return {
        kind: "rate_limited",
        error: "请求过于频繁，请稍后再试",
        retryAfterSec: limited.retryAfterSec,
      };
    }

    const getCached = unstable_cache(
      async () => {
        const computed = await computeInsightAnalysis({
          postId: normalizedPostId,
          subscribedSourcesLines: "",
        });
        if (computed) {
          await mergeInsightGlobalPayload(normalizedPostId, computed);
        }
        return computed;
      },
      ["post-insight-global", normalizedPostId],
      { revalidate: INSIGHT_CACHE_REVALIDATE_SEC },
    );

    const analysis = await getCached();

    if (!analysis) {
      return { kind: "not_found" };
    }

    return { kind: "success", analysis };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Analysis generation failed";
    return { kind: "server_error", error: message };
  }
}

/**
 * POST /api/analysis 主体逻辑（不含 Response 封装）
 */
export async function runPostInsightForRequest(request: Request): Promise<PostInsightServiceResult> {
  try {
    const body = await request.json().catch(() => ({}));
    const postId = body.postId;

    if (!postId || typeof postId !== "string") {
      return { kind: "bad_request", error: "Missing postId" };
    }

    if (isDemoPostId(postId)) {
      const demoPost = getDemoPostById(postId);
      if (demoPost) {
        return {
          kind: "success",
          analysis: buildDemoInsightPayload(demoPost),
        };
      }
    }

    if (isSeedPostId(postId) && SEED_INSIGHTS[postId]) {
      return { kind: "success", analysis: SEED_INSIGHTS[postId] };
    }

    const normalizedPostId = normalizeNewsItemId(postId);

    const fromDb = await getPersistedInsightForRead(normalizedPostId);
    if (fromDb) {
      return { kind: "success", analysis: fromDb };
    }

    let inflight = insightComputeCoalesce.get(normalizedPostId);
    if (!inflight) {
      const inflightPromise = runInsightComputeOnce(normalizedPostId, request).finally(() => {
        if (insightComputeCoalesce.get(normalizedPostId) === inflightPromise) {
          insightComputeCoalesce.delete(normalizedPostId);
        }
      });
      insightComputeCoalesce.set(normalizedPostId, inflightPromise);
      inflight = inflightPromise;
    }

    return await inflight;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Analysis generation failed";
    return { kind: "server_error", error: message };
  }
}
