"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { NewsItem } from "@/lib/types";
import { isLongformPreviewPost } from "@/lib/longform-post-utils";
import { cleanNewsTitle } from "@/lib/news-title-cleanup";
import { formatTypography } from "@/lib/utils";
import { FeedInsightSparkleGlyph } from "@/components/feed-inline-icons";
import { MathBlockText, MathInlineText } from "@/components/MathText";
import Tooltip from "@/components/Tooltip";

type LongformPost = NewsItem & { longform: NonNullable<NewsItem["longform"]> };

type LongformModuleProps = {
  posts: NewsItem[];
  onAddArticle?: () => void;
  analysisActivePostId?: string | null;
  onAnalysisToggle?: (postId: string) => void;
  previewPostIds?: Set<string>;
  fullLoadingPostIds?: Set<string>;
  fullErrorByPostId?: Record<string, string>;
  onRequestFullArticle?: (postId: string) => void | Promise<void>;
  showFloatingToc?: boolean;
};

type LongformDigest = {
  summary: string;
  points: string[];
};

type LongformTocItem = {
  id: string;
  title: string;
  index: number;
};

type LongformTocPosition = {
  left: number;
  top: number;
};

type LongformTocDragState = {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

const LONGFORM_TOC_WIDTH = 288;
const LONGFORM_TOC_GAP = 32;
const LONGFORM_TOC_MARGIN = 12;
const LONGFORM_TOC_DEFAULT_TOP = 148;
const LONGFORM_TOC_MIN_TOP = 64;
const LONGFORM_SECTION_ID = "longform-module";
const LONGFORM_HEADER_ID = "longform-module-header";

function clampLongformTocPosition(
  position: LongformTocPosition,
  width = LONGFORM_TOC_WIDTH,
  height = 420,
): LongformTocPosition {
  if (typeof window === "undefined") return position;

  const maxLeft = Math.max(LONGFORM_TOC_MARGIN, window.innerWidth - width - LONGFORM_TOC_MARGIN);
  const maxTop = Math.max(LONGFORM_TOC_MIN_TOP, window.innerHeight - Math.min(height, 96));

  return {
    left: Math.min(Math.max(LONGFORM_TOC_MARGIN, position.left), maxLeft),
    top: Math.min(Math.max(LONGFORM_TOC_MIN_TOP, position.top), maxTop),
  };
}

type LongformBodyBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

type BodyListItem = {
  ordered: boolean;
  text: string;
};

type EmphasisTermCandidate = {
  text: string;
  score: number;
  count: number;
};

type TextAnnotationState = {
  emphasisTotal: number;
  emphasisByTerm: Map<string, number>;
};

type TextAnnotationLimits = {
  total: number;
  perTerm: number;
};

type AcronymExpansionState = {
  expandedAcronyms: Set<string>;
  expansionTotal: number;
};

type ArticleDigestRole = "problem" | "method" | "result";

type ArticleDigestRoleCandidate = {
  role: ArticleDigestRole;
  text: string;
  score: number;
  paragraphIndex: number;
  sentenceIndex: number;
  fingerprint: string;
};

const DIGEST_POINT_LIMIT = 3;
const SUMMARY_MAX_LENGTH = 150;
const POINT_MAX_LENGTH = 112;
const PLAIN_SUMMARY_MAX_LENGTH = 76;
const PLAIN_POINT_MAX_LENGTH = 72;
const BODY_PARAGRAPH_TARGET_LENGTH = 360;
const BODY_PARAGRAPH_MAX_LENGTH = 520;
const BODY_EMPHASIS_TERM_LIMIT = 5;
const BODY_EMPHASIS_TOTAL_LIMIT = 8;
const BODY_EMPHASIS_PER_TERM_LIMIT = 2;
const DIGEST_EMPHASIS_TERM_LIMIT = 7;
const DIGEST_EMPHASIS_TOTAL_LIMIT = 4;
const DIGEST_EMPHASIS_PER_TERM_LIMIT = 1;
const BODY_ACRONYM_EXPANSION_LIMIT = 4;
const BODY_FOCUS_SCORE = 3.5;
const SENTENCE_RE = /[^。！？!?；;.\n]+[。！？!?；;.]?/g;
const STRONG_CONCLUSION_RE =
  /(研究发现|结果表明|结果显示|实验表明|数据显示|这意味着|这表明|由此可见|关键在于|核心是|结论是|因此|所以|因而|最终|总体来看|总的来说|换句话说|不应|不能|必须|需要|应该|建议|值得注意|最重要|显著|高于|低于|提升|提高|降低|减少|增加|导致|带来|影响|风险|瓶颈|限制|机会|价值|证明|found that|results? (show|suggest|indicate)|this means|therefore|overall|in conclusion|we conclude|key takeaway|should|must|need to|significant|increase|decrease|risk|impact)/i;
const WEAK_CONCLUSION_RE =
  /(发现|表明|显示|说明|意味着|揭示|印证|证明|指出|认为|强调|建议|结论|启示|影响|重要|关键|核心|主要|显著|更大|更小|更强|更弱|更高|更低|优于|差于|不足|问题|挑战|风险|机会|价值|found|suggest|indicate|imply|show|prove|conclude|important|key|major|challenge|risk|impact|value)/i;
const INTRO_RE =
  /(本文|本研究|这篇文章|本文中|在本文|我们研究|我们探讨|我们介绍|我们考察|我们评估|我们测试|我们试图|将介绍|将探讨|概述|背景|首先|主要介绍|旨在|目的在于|article (introduces|explores)|we (study|explore|introduce|present|evaluate|test|examine)|background|overview|introduction|whether)/i;
const LOW_VALUE_RE =
  /(欢迎|点赞|点个赞|收藏|转发|关注|订阅|评论区|分享给|如果看不完|如果你觉得|谢谢|感谢|参考文献|致谢|copyright|all rights reserved|references|acknowledg(e)?ments)/i;
const EXAMPLE_RE =
  /(例如|比如|举例|以.+为例|被公认为|代表了|包括|for example|for instance|such as)/i;
const METHOD_RE =
  /(被试|参与者|样本|问卷|实验设计|预先注册|我们采用|为了测试|为了避免|方法|研究\s*\d|考察|评估|测量|探究|校准|自我报告|完成模式|study\s*\d|participants?|sample|methodology|measure|evaluate|examine|calibration)/i;
const FIGURE_RE =
  /(图\s*\d+|表\s*\d+|Figure\s*\d+|Table\s*\d+|青色|橙色|蓝色|绿色|红色|紫色|灰色|柱状|曲线|坐标轴|图中)/i;
const FINDING_RE =
  /(发现|结果|表明|显示|显著|高于|低于|风险|降低|提升|提高|减少|增加|需要|必须|不应|不能|因此|所以|意味着|不是.+而是|found|results?|show|suggest|indicate|significant|risk|need|must|therefore)/i;
const CONCLUSION_SECTION_RE =
  /(结论|结语|总结|发现|结果|讨论|启示|影响|建议|实践意义|局限|展望|conclusion|findings|results|discussion|implications|recommendations|takeaways|limitations)/i;
const INTRO_SECTION_RE =
  /^(摘要|abstract|概要|summary|引言|介绍|背景|introduction|overview|background)$/i;
const DIGEST_PROBLEM_RE =
  /(问题|矛盾|挑战|难题|瓶颈|成本|昂贵|误差|限制|难以|当前|传统|现有|要解决|需要解决|面临|problem|challenge|trade-off|cost|expensive|error|limitation)/i;
const DIGEST_METHOD_RE =
  /(提出|引入|设计|采用|构建|训练|方法|模型|框架|架构|系统|通过|用来|解决|we (propose|present|introduce|design)|method|model|framework|architecture)/i;
const DIGEST_RESULT_RE =
  /(结果|实验|实现|达到|超过|优于|提升|降低|提高|效率|参数|倍|任务|表现|证明|说明|demonstrate|outperform|achieve|improve|efficient|results?|tasks?|parameters?)/i;

function getLongformPosts(posts: NewsItem[]): LongformPost[] {
  const seenUrls = new Set<string>();
  const out: LongformPost[] = [];

  for (const post of posts) {
    if (!post.longform?.translatedContent) continue;
    if (isLongformPreviewPost(post)) continue;

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
  return cleanNewsTitle(post.longform.translatedTitle || post.longform.title || post.title);
}

function getArticleAuthor(post: LongformPost): string {
  return post.longform.authorName || post.source.name || post.source.handle || "未知作者";
}

function getLongformArticleDomId(postId: string): string {
  const safeId = postId.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "");
  return `longform-article-${safeId || "item"}`;
}

function getCategoryTag(category: NewsItem["category"]) {
  return category || "行业";
}

function parseDate(dateString: string): Date | null {
  const d = new Date(dateString);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatDateZH(dateString: string): string {
  const d = parseDate(dateString);
  if (!d) return "未知日期";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function formatTimeLocalHM(dateString: string): string {
  const d = parseDate(dateString);
  if (!d) return "--:--";
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeEmphasisKey(text: string): string {
  return normalizeText(text).toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const BODY_ACRONYM_EXPANSIONS: Array<{ short: string; full: string }> = [
  { short: "AGI", full: "Artificial General Intelligence" },
  { short: "ASI", full: "Artificial Superintelligence" },
  { short: "BoMAI", full: "Boxed Myopic Artificial Intelligence" },
  { short: "LLM", full: "Large Language Model" },
  { short: "SLM", full: "Small Language Model" },
  { short: "RL", full: "Reinforcement Learning" },
  { short: "SFT", full: "Supervised Fine-Tuning" },
  { short: "MoE", full: "Mixture of Experts" },
  { short: "MRI", full: "Magnetic Resonance Imaging" },
  { short: "JEPA", full: "Joint Embedding Predictive Architecture" },
  { short: "UTM", full: "Universal Turing Machine" },
  { short: "KC", full: "Kolmogorov Complexity" },
];

const BODY_EMPHASIS_STOP_TERMS = new Set([
  "AI",
  "API",
  "URL",
  "PDF",
  "HTML",
  "Figure",
  "Table",
  "研究",
  "结果",
  "问题",
  "方法",
  "任务",
  "系统",
]);

const BODY_LATIN_CONCEPT_RE =
  /\b(?:[A-Z]{2,}[A-Za-z0-9-]*|[A-Za-z]+(?:-[A-Za-z0-9]+)+|[A-Z][A-Za-z]+(?:Bench|Code|Net|GPT)\s+v?\d+(?:\.\d+)?|[A-Z][A-Za-z]+(?:\s+[A-Z]?\d+(?:\.\d+)?)|Pass@\d)\b/g;

const BODY_CHINESE_CONCEPT_RE =
  /[\u4e00-\u9fffA-Za-z0-9-]{2,18}(?:语言模型|通用人工智能|人工智能|强化学习|监督微调|自蒸馏|可验证推理|推理模型|智能算法|奖励函数|探索原则|资源有界先验|模型|算法|智能|推理|能力|假说|基准|框架|范式|机制|原则|先验|奖励|风险|瓶颈|路径|架构)/g;

const BODY_QUOTED_CONCEPT_RE = /[「“《]([^」”》]{2,24})[」”》]/g;
const DIGEST_NUMERIC_INFO_RE =
  /(?:[$¥€£]?\d+(?:\.\d+)?\s?(?:%|倍|x|X|个|项|年|月|日|天|小时|分钟|秒|万|亿|千|百万|K|M|B|tokens?|parameters?|users?|days?|hours?|minutes?|seconds?)|(?:第一|首次|唯一|最大|最小|最高|最低|最多|最少|first|only|largest|smallest|highest|lowest|most|least))/gi;
const DIGEST_SIGNAL_PHRASE_RE =
  /(?:关键|重点|问题|风险|机会|原因|结果|影响|变化|差异|瓶颈|价值|结论|意味着|说明|指向|带来|导致|需要|应该|必须|核心在于|重点是|关键是|risk|impact|because|therefore|means|shows|suggests|requires|should|must)\s*(?:是|为|在于|来自|来自于|:|：|that|to|is|are)?\s*([^。；，、,.!?！？]{3,32})/gi;
const DIGEST_COMPARISON_INFO_RE =
  /(?:不是[^。；，、,.!?！？]{2,24}而是[^。；，、,.!?！？]{2,28}|高于[^。；，、,.!?！？]{2,24}|低于[^。；，、,.!?！？]{2,24}|提升[^。；，、,.!?！？]{2,24}|下降[^。；，、,.!?！？]{2,24}|增加[^。；，、,.!?！？]{2,24}|减少[^。；，、,.!?！？]{2,24}|超过[^。；，、,.!?！？]{2,24}|落后[^。；，、,.!?！？]{2,24}|领先[^。；，、,.!?！？]{2,24}|优于[^。；，、,.!?！？]{2,24}|弱于[^。；，、,.!?！？]{2,24}|更高[^。；，、,.!?！？]{2,24}|更低[^。；，、,.!?！？]{2,24}|更快[^。；，、,.!?！？]{2,24}|更慢[^。；，、,.!?！？]{2,24}|increase[^.;,!?]{2,36}|decrease[^.;,!?]{2,36}|reduce[^.;,!?]{2,36}|higher than[^.;,!?]{2,36}|lower than[^.;,!?]{2,36}|more than[^.;,!?]{2,36}|less than[^.;,!?]{2,36}|not [^.;,!?]{2,24} but [^.;,!?]{2,36})/gi;

function normalizeEmphasisTerm(raw: string): string {
  return normalizeText(raw)
    .replace(/^[#，,、：:；;。！？!?'"“”‘’「」《》()\[\]（）]+/, "")
    .replace(/[#，,、：:；;。！？!?'"“”‘’「」《》()\[\]（）]+$/, "")
    .replace(/^(这种|这个|一个|一种|该|其|我们|本文|本研究)/, "")
    .trim();
}

function isUsefulEmphasisTerm(term: string): boolean {
  if (!term) return false;
  if (term.length < 2 || term.length > 34) return false;
  if (BODY_EMPHASIS_STOP_TERMS.has(term)) return false;
  if (/^\d+(?:\.\d+)?$/.test(term)) return false;
  if (/^[a-z]+$/.test(term)) return false;
  if (/[。！？!?；;，,：:]/.test(term)) return false;
  return /[\u4e00-\u9fffA-Za-z]/.test(term);
}

function isUsefulDigestEmphasisTerm(term: string): boolean {
  if (!term) return false;
  if (term.length < 2 || term.length > 42) return false;
  if (BODY_EMPHASIS_STOP_TERMS.has(term)) return false;
  if (/^[a-z]+$/i.test(term)) return false;
  if (/^[\d\s.,%$¥€£xX+-]+$/.test(term) && !/[xX%$¥€£]/.test(term)) return false;
  if (/[。；！？!?]/.test(term)) return false;
  return /[\u4e00-\u9fffA-Za-z0-9]/.test(term);
}

function addEmphasisCandidate(
  candidates: Map<string, EmphasisTermCandidate>,
  raw: string,
  score: number,
) {
  const text = normalizeEmphasisTerm(raw);
  if (!isUsefulEmphasisTerm(text)) return;

  const key = normalizeEmphasisKey(text);
  const existing = candidates.get(key);
  if (existing) {
    existing.count += 1;
    existing.score += score;
    return;
  }

  candidates.set(key, { text, score, count: 1 });
}

function addDigestEmphasisCandidate(
  candidates: Map<string, EmphasisTermCandidate>,
  raw: string,
  score: number,
) {
  const text = normalizeEmphasisTerm(raw);
  if (!isUsefulEmphasisTerm(text) && !isUsefulDigestEmphasisTerm(text)) return;

  const key = normalizeEmphasisKey(text);
  const existing = candidates.get(key);
  if (existing) {
    existing.count += 1;
    existing.score += score;
    return;
  }

  candidates.set(key, { text, score, count: 1 });
}

function collectEmphasisCandidatesFromText(
  candidates: Map<string, EmphasisTermCandidate>,
  text: string,
  score: number,
) {
  for (const pattern of [BODY_LATIN_CONCEPT_RE, BODY_CHINESE_CONCEPT_RE, BODY_QUOTED_CONCEPT_RE]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      addEmphasisCandidate(candidates, match[1] || match[0], score);
    }
  }
}

function collectDigestInfoCandidatesFromText(
  candidates: Map<string, EmphasisTermCandidate>,
  text: string,
) {
  for (const pattern of [DIGEST_NUMERIC_INFO_RE, DIGEST_COMPARISON_INFO_RE]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      addDigestEmphasisCandidate(candidates, match[1] || match[0], 3);
    }
  }

  DIGEST_SIGNAL_PHRASE_RE.lastIndex = 0;
  let signalMatch: RegExpExecArray | null;
  while ((signalMatch = DIGEST_SIGNAL_PHRASE_RE.exec(text)) !== null) {
    addDigestEmphasisCandidate(candidates, signalMatch[1] || signalMatch[0], 2.6);
  }
}

function selectEmphasisTerms(
  candidates: Map<string, EmphasisTermCandidate>,
  limit: number,
): string[] {
  const ranked = [...candidates.values()]
    .map((candidate) => ({
      ...candidate,
      score: candidate.score + Math.min(candidate.count, 3) * 0.8 + Math.min(candidate.text.length, 14) * 0.04,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.text.length - a.text.length;
    });

  const selected: string[] = [];
  for (const candidate of ranked) {
    const key = normalizeEmphasisKey(candidate.text);
    const overlaps = selected.some((term) => {
      const selectedKey = normalizeEmphasisKey(term);
      return selectedKey.includes(key) || key.includes(selectedKey);
    });
    if (overlaps) continue;
    selected.push(candidate.text);
    if (selected.length >= limit) break;
  }

  return selected;
}

function getLongformEmphasisTerms(title: string, blocks: LongformBodyBlock[]): string[] {
  const candidates = new Map<string, EmphasisTermCandidate>();
  const bodyText = blocks
    .map((block) => (block.kind === "list" ? block.items.join(" ") : block.text))
    .join(" ");

  collectEmphasisCandidatesFromText(candidates, title, 3.5);
  collectEmphasisCandidatesFromText(candidates, bodyText, 1);

  for (const acronym of BODY_ACRONYM_EXPANSIONS) {
    const re = new RegExp(`\\b${escapeRegExp(acronym.short)}\\b`, "i");
    if (re.test(bodyText) || re.test(title)) {
      addEmphasisCandidate(candidates, acronym.short, 2.5);
    }
  }

  return selectEmphasisTerms(candidates, BODY_EMPHASIS_TERM_LIMIT);
}

function getLongformDigestEmphasisTerms(
  title: string,
  digest: LongformDigest,
  bodyTerms: string[],
): string[] {
  const candidates = new Map<string, EmphasisTermCandidate>();
  const digestText = [digest.summary, ...digest.points].filter(Boolean).join(" ");
  const lowerDigestText = digestText.toLowerCase();

  collectDigestInfoCandidatesFromText(candidates, digestText);
  collectEmphasisCandidatesFromText(candidates, digestText, 1.4);
  collectEmphasisCandidatesFromText(candidates, title, 0.8);

  for (const term of bodyTerms) {
    if (!term || !lowerDigestText.includes(term.toLowerCase())) continue;
    addDigestEmphasisCandidate(candidates, term, 1.2);
  }

  return selectEmphasisTerms(candidates, DIGEST_EMPHASIS_TERM_LIMIT);
}

function isLatinTerm(text: string): boolean {
  return /^[A-Za-z0-9@_.+-]+(?:\s+[A-Za-z0-9@_.+-]+)*$/.test(text);
}

function hasTermBoundary(text: string, start: number, end: number, term: string): boolean {
  if (!isLatinTerm(term)) return true;
  const prev = text[start - 1];
  const next = text[end];
  return !/[A-Za-z0-9@_.+-]/.test(prev || "") && !/[A-Za-z0-9@_.+-]/.test(next || "");
}

function canUseEmphasis(
  term: string,
  state: TextAnnotationState,
  limits: TextAnnotationLimits = {
    total: BODY_EMPHASIS_TOTAL_LIMIT,
    perTerm: BODY_EMPHASIS_PER_TERM_LIMIT,
  },
): boolean {
  if (state.emphasisTotal >= limits.total) return false;
  const key = normalizeEmphasisKey(term);
  return (state.emphasisByTerm.get(key) ?? 0) < limits.perTerm;
}

function recordEmphasis(term: string, state: TextAnnotationState) {
  const key = normalizeEmphasisKey(term);
  state.emphasisTotal += 1;
  state.emphasisByTerm.set(key, (state.emphasisByTerm.get(key) ?? 0) + 1);
}

function getAcronymExpansion(term: string, state: AcronymExpansionState): string | null {
  if (state.expansionTotal >= BODY_ACRONYM_EXPANSION_LIMIT) return null;
  const key = normalizeEmphasisKey(term);
  const full = BODY_ACRONYM_EXPANSIONS.find(
    (item) => normalizeEmphasisKey(item.short) === key,
  )?.full;
  if (!full || state.expandedAcronyms.has(key)) return null;
  state.expandedAcronyms.add(key);
  state.expansionTotal += 1;
  return full;
}

function expandKnownAcronymsInText(text: string, state: AcronymExpansionState): string {
  if (!text || state.expansionTotal >= BODY_ACRONYM_EXPANSION_LIMIT) return text;

  const terms = BODY_ACRONYM_EXPANSIONS.map((item) => item.short).sort((a, b) => b.length - a.length);
  let cursor = 0;
  let out = "";

  while (cursor < text.length) {
    const match = findNextAnnotationTerm(text, cursor, terms);
    if (!match) break;

    const end = match.index + match.term.length;
    out += text.slice(cursor, match.index);

    const visibleTerm = text.slice(match.index, end);
    const expansion = getAcronymExpansion(match.term, state);
    const insideParentheses = /[（(]$/.test(text.slice(0, match.index)) && /^[）)]/.test(text.slice(end));
    out += expansion
      ? insideParentheses
        ? `${visibleTerm}, ${expansion}`
        : `${visibleTerm}（${expansion}）`
      : visibleTerm;
    cursor = end;
  }

  return `${out}${text.slice(cursor)}`;
}

function expandKnownAcronymsInBlocks(blocks: LongformBodyBlock[]): LongformBodyBlock[] {
  const state: AcronymExpansionState = {
    expandedAcronyms: new Set(),
    expansionTotal: 0,
  };

  return blocks.map((block) => {
    if (block.kind === "heading") return block;
    if (block.kind === "list") {
      return {
        ...block,
        items: block.items.map((item) => expandKnownAcronymsInText(item, state)),
      };
    }
    return {
      ...block,
      text: expandKnownAcronymsInText(block.text, state),
    };
  });
}

function findNextAnnotationTerm(
  text: string,
  cursor: number,
  terms: string[],
): { index: number; term: string } | null {
  const lowerText = text.toLowerCase();
  let best: { index: number; term: string } | null = null;

  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    let index = lowerText.indexOf(lowerTerm, cursor);
    while (index !== -1) {
      const end = index + term.length;
      if (hasTermBoundary(text, index, end, term)) {
        if (
          !best ||
          index < best.index ||
          (index === best.index && term.length > best.term.length)
        ) {
          best = { index, term };
        }
        break;
      }
      index = lowerText.indexOf(lowerTerm, index + 1);
    }
  }

  return best;
}

function renderTextWithLongformAnnotations(
  text: string,
  keyPrefix: string,
  emphasisTerms: string[],
  state: TextAnnotationState,
  limits?: TextAnnotationLimits,
): ReactNode {
  const formatted = formatTypography(text);
  const terms = [...new Set(emphasisTerms)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (terms.length === 0) return formatted;

  const nodes: ReactNode[] = [];
  let cursor = 0;

  while (cursor < formatted.length) {
    const match = findNextAnnotationTerm(formatted, cursor, terms);
    if (!match) break;

    const end = match.index + match.term.length;
    if (match.index > cursor) {
      nodes.push(formatted.slice(cursor, match.index));
    }

    const visibleTerm = formatted.slice(match.index, end);
    const shouldEmphasize = emphasisTerms.some(
      (term) => normalizeEmphasisKey(term) === normalizeEmphasisKey(match.term),
    ) && canUseEmphasis(match.term, state, limits);

    if (shouldEmphasize) {
      recordEmphasis(match.term, state);
      nodes.push(
        <strong
          key={`${keyPrefix}-strong-${match.index}`}
          className="font-semibold text-[#101828]"
        >
          {visibleTerm}
        </strong>,
      );
    } else {
      nodes.push(visibleTerm);
    }

    cursor = end;
  }

  if (cursor < formatted.length) {
    nodes.push(formatted.slice(cursor));
  }

  return nodes.length > 0 ? nodes : formatted;
}

function stripListMarker(text: string): string {
  return text
    .replace(/^([（(]?\d{1,2}[）).、]\s*|[-*•·]\s+)/, "")
    .replace(/^图\s*\d+\s*[：:]\s*/, "")
    .trim();
}

function truncateText(text: string, maxLength: number): string {
  const clean = normalizeText(stripListMarker(text));
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).replace(/[，,、：:；;\s]+$/g, "")}…`;
}

function finishSentence(text: string): string {
  const clean = normalizeText(text).replace(/[，,、：:；;\s]+$/g, "");
  if (!clean) return clean;
  return /[。！？!?]$/.test(clean) ? clean : `${clean}。`;
}

function stripAcademicNoise(text: string): string {
  return normalizeText(text)
    .replace(/\[[^\]]+\]/g, "")
    .replace(/（[^）]*(?:202\d|19\d{2}|et al\.?|哈萨比斯|引用|参考)[^）]*）/gi, "")
    .replace(/\([^)]*(?:202\d|19\d{2}|et al\.?|citation|reference)[^)]*\)/gi, "")
    .replace(/^(结果发现|研究发现|结果表明|结果显示|实验表明|数据显示|这意味着|这表明|因此|所以|总体来看|总的来说)[，,:：\s]*/, "")
    .replace(/人工智能/g, "AI")
    .replace(/显著/g, "明显")
    .replace(/高频率/g, "经常")
    .replace(/后续/g, "之后")
    .replace(/认知偏差/g, "误判")
    .replace(/采纳/g, "使用")
    .replace(/必须/g, "得")
    .replace(/需要/g, "要")
    .replace(/\s+/g, " ")
    .trim();
}

function plainDigestText(text: string): string {
  return normalizeText(text)
    .replace(/本研究|本文|本论文|这项研究|该研究/g, "文章")
    .replace(/当前的?([^，。；;：:]{2,24})面临(?:一个)?(?:根本性的)?矛盾[:：]/g, "$1的问题是")
    .replace(/旨在|意在/g, "想")
    .replace(/探究|探索|考察/g, "弄清")
    .replace(/验证/g, "检验")
    .replace(/表明|显示|揭示/g, "说明")
    .replace(/显著/g, "明显")
    .replace(/性能/g, "表现")
    .replace(/模型规模/g, "模型大小")
    .replace(/开放域知识/g, "开放知识")
    .replace(/泛化能力|泛化/g, "迁移能力")
    .replace(/长尾场景|长尾经验/g, "冷门场景")
    .replace(/可及性/g, "更容易用上")
    .replace(/可验证推理/g, "可检验推理")
    .replace(/专项能力/g, "专门能力")
    .replace(/推理效率/g, "推理速度")
    .replace(/要实现可靠的长期模拟要深度计算/g, "长期模拟要大量计算")
    .replace(/更深的模型部署成本高昂/g, "模型越深成本越高")
    .replace(/容易产生累积误差/g, "误差也容易累积")
    .replace(/自适应计算能力/g, "按难度调整计算量")
    .replace(/自动调整深度以匹配每一步预测的复杂度/g, "能按每一步的难度决定算多深")
    .replace(/复杂编程任务/g, "复杂编程")
    .replace(/高难数学/g, "难数学")
    .replace(/\s+/g, " ")
    .trim();
}

function compactDigestLead(text: string): string {
  return normalizeText(text)
    .replace(
      /^(这篇文章|这篇论文|文章|论文|报告|这个研究|这项研究|这份报告|本文|本研究)(主要)?(讲|讨论|研究|围绕|想|试图|旨在|介绍|提出|检验|评估|说明)?[:：，,]?\s*/,
      "",
    )
    .replace(/^(它|该文|该研究|作者)(主要)?(说明|发现|认为|展示|提出)?[:：，,]?\s*/, "")
    .replace(/^(结果是|结论是|核心是|重点是)[:：，,]?\s*/, "")
    .trim();
}

function formatArticleDigestLine(raw: string, maxLength: number): string {
  const clean = compactDigestLead(plainDigestText(stripAcademicNoise(raw)));
  return finishSentence(truncateText(clean, maxLength));
}

function getArticleDigestName(title: string, text: string): string {
  const cleanTitle = compactDigestLead(title).replace(/[。！？!?]$/g, "").trim();
  const acronym = text.match(/\b[A-Z][A-Za-z0-9-]{2,}\b/)?.[0];
  if (cleanTitle && acronym && !cleanTitle.includes(acronym)) return `${cleanTitle}（${acronym}）`;
  return cleanTitle || acronym || "这篇文章";
}

function buildDigestSummary(title: string, problem: string | undefined, method: string | undefined, fallback: string | undefined): string {
  const context = [method, problem, fallback].filter(Boolean).join(" ");
  const name = getArticleDigestName(title, context);
  const definitionMatch = context.match(/(?:这?是|属于|作为)([^。！？；;]{4,42}(?:架构|方法|模型|系统|框架))/);
  const problemText = formatArticleDigestLine(problem || "", 34).replace(/[。！？!?]$/g, "");

  if (definitionMatch?.[1] && problemText) {
    return finishSentence(truncateText(`${name}：${definitionMatch[1]}，用来解决${problemText}`, PLAIN_SUMMARY_MAX_LENGTH));
  }
  if (problemText) {
    return finishSentence(truncateText(`${name}：解决${problemText}`, PLAIN_SUMMARY_MAX_LENGTH));
  }
  return formatArticleDigestLine(fallback || name, PLAIN_SUMMARY_MAX_LENGTH);
}

function scoreArticleDigestRole(
  sentence: string,
  role: ArticleDigestRole,
  paragraphIndex: number,
  paragraphCount: number,
  sectionHeading: string | null,
): number {
  const clean = normalizeText(sentence);
  const position = paragraphCount > 1 ? paragraphIndex / (paragraphCount - 1) : 0;
  let score = 0;

  if (role === "problem") {
    if (DIGEST_PROBLEM_RE.test(clean)) score += 4;
    if (position <= 0.35) score += 1.4;
    if (sectionHeading && INTRO_SECTION_RE.test(normalizeText(sectionHeading))) score += 0.8;
  }

  if (role === "method") {
    if (DIGEST_METHOD_RE.test(clean)) score += 4;
    if (position <= 0.58) score += 1.1;
    if (METHOD_RE.test(clean)) score += 0.9;
  }

  if (role === "result") {
    if (DIGEST_RESULT_RE.test(clean) || FINDING_RE.test(clean)) score += 4;
    if (position >= 0.18) score += 1.1;
    if (sectionHeading && CONCLUSION_SECTION_RE.test(sectionHeading)) score += 1.2;
  }

  if (hasQuantitativeSignal(clean)) score += 0.7;
  if (LOW_VALUE_RE.test(clean)) score -= 5;
  if (FIGURE_RE.test(clean) && !FINDING_RE.test(clean)) score -= 2;
  if (EXAMPLE_RE.test(clean) && role !== "method") score -= 1.8;
  if (role === "result" && /TransDreamer|DreamerV3/i.test(clean) && !/(相比|与传统|参数|任务|效率|表现|超过|优于)/.test(clean)) score -= 2.5;
  if (clean.length < 24) score -= 2;
  if (clean.length > 220) score -= 0.6;

  return score;
}

function collectArticleDigestRoleCandidates(post: LongformPost, paragraphs: string[]): ArticleDigestRoleCandidate[] {
  const title = getArticleTitle(post);
  const titleKey = sentenceFingerprint(title);
  const candidates: ArticleDigestRoleCandidate[] = [];
  let sectionHeading: string | null = null;

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const cleanParagraph = normalizeText(paragraph);
    if (!cleanParagraph) return;

    if (isLikelySectionHeading(cleanParagraph, paragraphIndex)) {
      sectionHeading = cleanParagraph;
      return;
    }

    if (isBoilerplateParagraph(cleanParagraph, title) && !DIGEST_PROBLEM_RE.test(cleanParagraph) && !DIGEST_METHOD_RE.test(cleanParagraph)) {
      return;
    }

    getTextSentences(cleanParagraph).forEach((sentence, sentenceIndex) => {
      const cleanSentence = truncateText(sentence, POINT_MAX_LENGTH);
      const fingerprint = sentenceFingerprint(cleanSentence);
      if (!fingerprint || fingerprint === titleKey) return;

      (["problem", "method", "result"] as ArticleDigestRole[]).forEach((role) => {
        const score = scoreArticleDigestRole(cleanSentence, role, paragraphIndex, paragraphs.length, sectionHeading);
        if (score < 2.2) return;
        candidates.push({
          role,
          text: cleanSentence,
          score,
          paragraphIndex,
          sentenceIndex,
          fingerprint,
        });
      });
    });
  });

  return candidates;
}

function pickArticleDigestRoleCandidate(
  candidates: ArticleDigestRoleCandidate[],
  role: ArticleDigestRole,
  usedFingerprints: Set<string>,
): ArticleDigestRoleCandidate | null {
  return [...candidates]
    .filter((candidate) => candidate.role === role && !usedFingerprints.has(candidate.fingerprint))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.paragraphIndex !== b.paragraphIndex) return a.paragraphIndex - b.paragraphIndex;
      return a.sentenceIndex - b.sentenceIndex;
    })[0] ?? null;
}

function buildArticleDigestPoint(text: string): string {
  return formatArticleDigestLine(text, PLAIN_POINT_MAX_LENGTH);
}

function sentenceFingerprint(text: string): string {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^\u4e00-\u9fffA-Za-z0-9]+/g, "")
    .slice(0, 84);
}

function isDigestHeading(text: string): boolean {
  return /^(摘要|abstract|概要|summary)[:：]?$/i.test(normalizeText(text));
}

function isBoilerplateParagraph(paragraph: string, title: string): boolean {
  const clean = normalizeText(paragraph);
  if (!clean || clean.length < 36) return true;
  if (sentenceFingerprint(clean) === sentenceFingerprint(title)) return true;
  if (/^\[[\d.]+\]/.test(clean)) return true;
  if (/^(摘要|abstract|概要|summary|索引术语|关键词|index terms)[:：]?$/i.test(clean)) return true;
  if (/(电子邮箱|稿件于|received|corresponding author|copyright|all rights reserved)/i.test(clean) && clean.length < 260) {
    return true;
  }
  return false;
}

function hasQuantitativeSignal(text: string): boolean {
  return /(\d+(?:\.\d+)?\s*(%|倍|个|项|次|分钟|小时|天|周|月|年|k|K|M|B|万|亿)|p\s*[<=>]|β\s*=|N\s*=)/.test(text);
}

function getDigestParagraphs(post: LongformPost, paragraphs: string[]): string[] {
  const title = getArticleTitle(post);
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (paragraph: string) => {
    const clean = normalizeText(paragraph);
    const key = sentenceFingerprint(clean);
    if (!key || seen.has(key) || isBoilerplateParagraph(clean, title)) return;
    seen.add(key);
    out.push(clean);
  };

  for (let i = 0; i < paragraphs.length - 1; i += 1) {
    if (isDigestHeading(paragraphs[i])) {
      add(paragraphs[i + 1]);
      break;
    }
  }

  for (const paragraph of paragraphs) {
    if (out.length >= 8) break;
    add(paragraph);
  }

  return out;
}

function getTextSentences(text: string): string[] {
  const clean = normalizeText(text);
  if (!clean) return [];
  const matches = clean.match(SENTENCE_RE) ?? [clean];
  return matches
    .map((sentence) => truncateText(sentence, POINT_MAX_LENGTH))
    .filter((sentence) => sentence.length >= 12 && !/^https?:\/\//i.test(sentence));
}

function getParagraphs(text: string): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];

  const blocks = clean
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (blocks.length > 1 || clean.length < 900) return blocks;

  const sentences = getTextSentences(clean);
  if (sentences.length <= 1) return blocks;

  const grouped: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > 320) {
      grouped.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) grouped.push(current);
  return grouped;
}


function buildLongformDigest(post: LongformPost, paragraphs: string[]): LongformDigest {
  const article = post.longform;
  const storedSummary = normalizeText(article.digestSummary || "");
  const storedPoints = (article.digestPoints ?? [])
    .map((point) => normalizeText(point))
    .filter(Boolean)
    .slice(0, DIGEST_POINT_LIMIT);
  if (storedSummary || storedPoints.length > 0) {
    return { summary: storedSummary, points: storedPoints };
  }

  const title = getArticleTitle(post);
  const digestParagraphs = getDigestParagraphs(post, paragraphs);
  const roleCandidates = collectArticleDigestRoleCandidates(post, paragraphs);
  const usedFingerprints = new Set<string>();
  const problemCandidate = pickArticleDigestRoleCandidate(roleCandidates, "problem", usedFingerprints);
  if (problemCandidate) usedFingerprints.add(problemCandidate.fingerprint);
  const methodCandidate = pickArticleDigestRoleCandidate(roleCandidates, "method", usedFingerprints);
  if (methodCandidate) usedFingerprints.add(methodCandidate.fingerprint);
  const resultCandidate = pickArticleDigestRoleCandidate(roleCandidates, "result", usedFingerprints);
  if (resultCandidate) usedFingerprints.add(resultCandidate.fingerprint);

  const fallbackSummarySource = [article.excerpt, digestParagraphs[0], paragraphs[0]]
    .map((value) => normalizeText(value || ""))
    .find((value) => value && !isBoilerplateParagraph(value, title));
  const summary = buildDigestSummary(
    title,
    problemCandidate?.text,
    methodCandidate?.text,
    fallbackSummarySource,
  );
  const points: string[] = [];
  const summaryKey = sentenceFingerprint(summary);
  const pointSeen = new Set<string>();

  const addPoint = (raw: string, alreadyPlain = false) => {
    const point = alreadyPlain
      ? finishSentence(truncateText(raw, PLAIN_POINT_MAX_LENGTH))
      : formatArticleDigestLine(raw, PLAIN_POINT_MAX_LENGTH);
    if (point.length < 16) return;
    const key = sentenceFingerprint(point);
    if (!key || pointSeen.has(key) || key === summaryKey) return;
    if (
      /简单任务/.test(summary) &&
      /简单任务/.test(point) &&
      /(高估|省时|省事)/.test(summary) &&
      /(高估|省时|省事)/.test(point)
    ) {
      return;
    }
    pointSeen.add(key);
    points.push(point);
  };

  for (const candidate of [problemCandidate, methodCandidate, resultCandidate]) {
    if (!candidate) continue;
    addPoint(buildArticleDigestPoint(candidate.text), true);
  }

  if (points.length < DIGEST_POINT_LIMIT) {
    const fallbackCandidates = [...roleCandidates]
      .filter((candidate) => !usedFingerprints.has(candidate.fingerprint))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.paragraphIndex - b.paragraphIndex;
      });

    for (const candidate of fallbackCandidates) {
      addPoint(buildArticleDigestPoint(candidate.text), true);
      usedFingerprints.add(candidate.fingerprint);
      if (points.length >= DIGEST_POINT_LIMIT) break;
    }
  }

  if (points.length < 2) {
    for (const paragraph of digestParagraphs.slice(0, 5)) {
      addPoint(paragraph);
      if (points.length >= DIGEST_POINT_LIMIT) break;
    }
  }

  return { summary, points };
}

function isHttpUrl(value: string | undefined): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function getHostLabel(url: string | undefined): string | null {
  if (!isHttpUrl(url)) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isLikelySectionHeading(paragraph: string, index: number): boolean {
  const clean = normalizeText(paragraph);
  return (
    index > 0 &&
    clean.length <= 42 &&
    !/[。！？!?；;.]$/.test(clean) &&
    !/[，,]/.test(clean) &&
    !/^https?:\/\//i.test(clean)
  );
}

const BODY_STOP_HEADING_RE =
  /^(参考文献|参考资料|参考与引用|引用与参考|延伸阅读|相关阅读|引用|注释|脚注|致谢|附录|作者信息|版权|声明|References?|Bibliography|Citations?|Notes?|Footnotes?|Acknowledg(e)?ments?|Appendix|Author information|Copyright|Related reading)$/i;

const BODY_NOISE_RE =
  /(跳至主内容|帮助\s*[|｜]\s*高级搜索|高级搜索|快速链接|帮助页面|查看\s*PDF|HTML\s*[（(]实验性[）)]|所有字段|期刊参考文献|ACM\s*分类|MSC\s*分类|报告编号|arXiv\s*标识符|ORCID|作者\s*ID|帮助页面|全文|执行|提交于|计算机科学\s*>\s*人工智能|西蒙斯基金会|所有贡献者|捐赠|版权所有|保留所有权利|未经许可|转载请|免责声明|隐私政策|Cookie|扫码|二维码|关注我们|欢迎关注|点赞|点个赞|收藏一下|收藏|转发|评论区|分享本文|点击阅读原文|原文链接|下载 PDF|订阅|登录后|注册后|邮箱地址|如果看不完|如果你觉得|感谢|All rights reserved|copyright|subscribe|sign up|sign in|log in|follow us|share this|cookie policy|privacy policy|read more|download pdf)/i;

const BODY_METADATA_RE =
  /^(作者|来源|发布时间|发布日期|更新日期|提交于|编辑|责任编辑|译者|校对|标题|原文|原文链接|链接|DOI|doi|arXiv|关键词|关键字|标签|分类|Citation|Cite|Author|Authors|Source|Published|Submitted|Updated|Title|Keywords|Tags)\s*[:：\[]/i;

const FRONT_MATTER_HEADING_RE =
  /^(摘要|abstract|概要|summary|引言|introduction|正文|main text)$/i;

const BODY_CHROME_LABEL_RE =
  /^(跳至主内容|搜索|执行|快速链接|登录|帮助页面|帮助|关于|捐赠|查看\s*PDF\s*HTML\s*[（(]实验性[）)]|查看\s*PDF|HTML\s*[（(]实验性[）)])$/i;

const FRONT_MATTER_LINE_RE =
  /(^\[[\d.]+\]\s+|@|\.edu\b|\.com\b|\.org\b|\.net\b|arxiv|labs\.arxiv|大学|学院|研究所|实验室|系|部门|中心|教授|博士|邮箱|邮件|电子邮件|地址|邮编|美国|英国|澳大利亚|加拿大|中国|牛津|剑桥|辛辛那提|堪培拉|OX\d|^\s*[&＆]|^\p{Script=Han}{2,8}[·・]\p{Script=Han}{1,8}|^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3}$)/iu;

const BODY_REFERENCE_ENTRY_RE =
  /^(\[?\d{1,3}\]?|[-*•·])[\s.)、]+.+(?:doi|arxiv|et al\.|journal|proceedings|conference|publisher)/i;

const NUMBERED_AUTHOR_YEAR_REFERENCE_RE =
  /^(\[?\d{1,3}\]?|[-*•·])[\s.)、]+[A-Z][A-Za-z.'-]+,\s+[A-Z][\s\S]{18,}(?:19|20)\d{2}/;

const AUTHOR_YEAR_REFERENCE_RE =
  /^[A-Z][A-Za-z.'-]+,\s+[A-Z][\s\S]{18,}(?:19|20)\d{2}/;

function stripInlineReferences(text: string): string {
  return text
    .replace(/\s*\[[0-9,\s;；、-]+\]/g, "")
    .replace(/\s*［[0-9,\s;；、-]+］/g, "")
    .replace(/\s*[（(]\s*[?？]\s*[）)]/g, "")
    .replace(/\s*[（(][^（）()]{0,80}(?:19|20)\d{2}[^（）()]{0,80}[）)]/g, "")
    .replace(/\s*[（(](?:见|参见|来源|参考|引用|citation|reference)[^（）()]{0,80}[）)]/gi, "")
    .replace(/([\u4e00-\u9fffA-Za-z0-9])\s*[?？]\s*(?=[，。；：、,.;:）)]|和|与|及|的|中|里|上|下|则|但|此外|这一|这些|该|在)/g, "$1")
    .replace(/\s+([，。！？；：,.!?;:])/g, "$1")
    .replace(/([，,、；;])([。！？!?])/g, "$2")
    .replace(/[（(]\s*[）)]/g, "")
    .trim();
}

function normalizeLongformBodyDisplayText(text: string): string {
  return text
    .replace(/(\d)[\s\u200b\u200c\u200d]*[.．][\s\u200b\u200c\u200d]*(\d)/g, "$1.$2")
    .replace(/([\u4e00-\u9fffA-Za-z0-9])(?:和|与|及)的/g, "$1的")
    .replace(/(讨论)见(?=[。；;])/g, "$1")
    .replace(/\s+([，。！？；：,.!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLongformBodyParagraph(raw: string): string {
  return normalizeLongformBodyDisplayText(stripInlineReferences(
    normalizeText(raw)
      .replace(/^#{1,6}\s*/, "")
      .replace(/^>\s*/, "")
      .replace(/^(\*\*|__)(.+?)\1$/g, "$2")
      .replace(/!\[[^\]]*]\([^)]+\)/g, "")
      .replace(/\[([^\]]+)]\((?:https?:)?\/\/[^)]+\)/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/\bdoi:\s*\S+/gi, "")
      .replace(/\[[0-9,\s;；、-]+\]/g, "")
      .replace(/［[0-9,\s;；、-]+］/g, "")
      .replace(/^(摘要|abstract|概要|summary)\s*[:：]\s*/i, "")
      .replace(/(\d)\s*\.\s*(\d)/g, "$1.$2")
      .replace(/\s+/g, " ")
      .trim(),
  ));
}

function isLikelyReferenceEntry(paragraph: string): boolean {
  const clean = normalizeText(paragraph);
  if (!clean) return false;
  if (BODY_REFERENCE_ENTRY_RE.test(clean)) return true;
  if (NUMBERED_AUTHOR_YEAR_REFERENCE_RE.test(clean) && clean.length < 360) return true;
  if (AUTHOR_YEAR_REFERENCE_RE.test(clean) && clean.length < 320) return true;
  return /^(doi|arxiv)\s*[:：]/i.test(clean);
}

function getBodyListItem(paragraph: string): BodyListItem | null {
  const clean = paragraph.trim();
  if (/^[（(]?\d{1,2}[）).、]\s+/.test(clean)) {
    return { ordered: true, text: stripListMarker(clean) };
  }

  if (/^[-*•·]\s+/.test(clean)) {
    return { ordered: false, text: stripListMarker(clean) };
  }

  return null;
}

function splitBodyParagraph(paragraph: string): string[] {
  const clean = normalizeText(paragraph);
  if (clean.length <= BODY_PARAGRAPH_MAX_LENGTH) return [clean];

  const sentences = clean.match(SENTENCE_RE);
  if (!sentences || sentences.length <= 1) return [clean];

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence.trim()}` : sentence.trim();
    if (current && next.length > BODY_PARAGRAPH_TARGET_LENGTH) {
      chunks.push(current);
      current = sentence.trim();
      continue;
    }
    current = next;
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [clean];
}

function buildOptimizedBodyBlocks(paragraphs: string[], title: string): LongformBodyBlock[] {
  const blocks: LongformBodyBlock[] = [];
  let pendingList: Extract<LongformBodyBlock, { kind: "list" }> | null = null;

  const flushList = () => {
    if (!pendingList || pendingList.items.length === 0) return;
    blocks.push(pendingList);
    pendingList = null;
  };

  getCleanBodyParagraphs(paragraphs, title).forEach((paragraph, paragraphIndex) => {
    if (isLikelySectionHeading(paragraph, paragraphIndex)) {
      flushList();
      blocks.push({ kind: "heading", text: normalizeLongformBodyDisplayText(paragraph) });
      return;
    }

    const listItem = getBodyListItem(paragraph);
    if (listItem?.text) {
      if (!pendingList || pendingList.ordered !== listItem.ordered) {
        flushList();
        pendingList = { kind: "list", ordered: listItem.ordered, items: [] };
      }
      pendingList.items.push(normalizeLongformBodyDisplayText(listItem.text));
      return;
    }

    flushList();
    for (const chunk of splitBodyParagraph(paragraph)) {
      blocks.push({ kind: "paragraph", text: normalizeLongformBodyDisplayText(chunk) });
    }
  });

  flushList();
  return blocks;
}

function getLongformBodyBlockText(block: LongformBodyBlock): string {
  return block.kind === "list" ? block.items.join(" ") : block.text;
}

function scoreBodyReadingBlock(block: LongformBodyBlock, blockIndex: number, blockCount: number): number {
  if (block.kind === "heading") return -2;

  const text = getLongformBodyBlockText(block);
  if (!text || text.length < 28) return -2;

  const position = blockCount > 1 ? blockIndex / (blockCount - 1) : 0;
  const hasFindingSignal = FINDING_RE.test(text);
  let score = 0;

  if (STRONG_CONCLUSION_RE.test(text)) score += 4;
  else if (hasFindingSignal) score += 2.4;
  else if (WEAK_CONCLUSION_RE.test(text)) score += 1.4;

  if (hasQuantitativeSignal(text)) score += 1.3;
  if (/不是.+而是|并非.+而是|rather than|not .+ but/i.test(text)) score += 1.2;
  if (block.kind === "list") score += 0.9;
  if (position >= 0.45) score += 0.7;
  if (position <= 0.12) score -= 0.6;
  if (INTRO_RE.test(text)) score -= blockIndex <= 2 ? 0.75 : 1.5;
  if ((METHOD_RE.test(text) || FIGURE_RE.test(text)) && !hasFindingSignal) score -= 2.5;
  if (LOW_VALUE_RE.test(text)) score -= 4;
  if (text.length > 180 && text.length <= BODY_PARAGRAPH_TARGET_LENGTH) score += 0.35;

  return score;
}

function shouldStopLongformBody(paragraph: string, index: number): boolean {
  const clean = cleanLongformBodyParagraph(paragraph).replace(/[：:]+$/g, "");
  return index > 0 && clean.length <= 48 && BODY_STOP_HEADING_RE.test(clean);
}

function isLongformBodyNoise(paragraph: string, title: string): boolean {
  const clean = cleanLongformBodyParagraph(paragraph);
  if (!clean) return true;
  if (sentenceFingerprint(clean) === sentenceFingerprint(title)) return true;
  if (/^[-=_]{3,}$/.test(clean)) return true;
  if (/^@[\w.-]+$/.test(clean)) return true;
  if (BODY_CHROME_LABEL_RE.test(clean)) return true;
  if (FRONT_MATTER_HEADING_RE.test(clean)) return true;
  if (clean.length <= 80 && FRONT_MATTER_LINE_RE.test(clean)) return true;
  if (/^(图|表|Figure|Table)\s*\d+[\s：:.-]/i.test(clean) && clean.length < 180) return true;
  if (/^\[?\d+\]?\s+[\w\u4e00-\u9fff].*(19|20)\d{2}/.test(clean) && clean.length < 240) return true;
  if (isLikelyReferenceEntry(clean)) return true;
  if (BODY_METADATA_RE.test(clean)) return true;
  if (BODY_NOISE_RE.test(clean) && clean.length < 260) return true;
  return false;
}

function isLikelyFrontMatterLine(paragraph: string): boolean {
  const clean = cleanLongformBodyParagraph(paragraph);
  if (!clean || clean.length > 90) return false;
  if (FRONT_MATTER_HEADING_RE.test(clean) || FRONT_MATTER_LINE_RE.test(clean)) return true;
  return (
    clean.length <= 48 &&
    !/[。！？!?；;，,：:]/.test(clean) &&
    /[\p{Script=Han}A-Za-z]/u.test(clean)
  );
}

function getCleanBodyParagraphs(paragraphs: string[], title: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let inLikelyFrontMatter = true;

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    if (shouldStopLongformBody(paragraph, index)) break;

    const clean = cleanLongformBodyParagraph(paragraph);
    if (inLikelyFrontMatter) {
      if (isLikelyFrontMatterLine(clean) || isLongformBodyNoise(clean, title)) {
        continue;
      }
      inLikelyFrontMatter = false;
    }

    if (isLongformBodyNoise(clean, title)) continue;

    const key = sentenceFingerprint(clean);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    out.push(clean);
  }

  return out.length > 0
    ? out
    : paragraphs.map(cleanLongformBodyParagraph).filter(Boolean);
}

function PlusGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
    >
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AddArticleButton({ onClick }: { onClick?: () => void }) {
  if (!onClick) return null;

  return (
    <Tooltip content="添加文章">
      <button
        type="button"
        onClick={onClick}
        aria-label="添加文章"
        className="btn-press inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-transparent p-0 text-[#0055FF] transition-colors hover:bg-[#f5f7ff] hover:text-[#0046d5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30"
      >
        <PlusGlyph className="block size-5" />
      </button>
    </Tooltip>
  );
}

function LongformAnalysisButton({
  active,
  title,
  onClick,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label={`${active ? "关闭" : "打开"}解读：${title}`}
      aria-pressed={active}
      className={[
        "motion-layout-ease btn-press inline-flex h-8 shrink-0 items-center gap-[8px] rounded-[2px] px-[15px] font-sans text-[12px] font-bold leading-none tracking-[0.06em] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30",
        active
          ? "border border-solid border-[#ffb224] bg-[rgba(255,178,36,0.1)] text-[#ffb224] shadow-xs"
          : "border border-solid border-[#e5e7eb] bg-white text-[#8a8a93]",
      ].join(" ")}
    >
      <span className="relative size-[14.667px] shrink-0">
        <FeedInsightSparkleGlyph className="absolute inset-0 block size-full max-w-none" />
      </span>
      解读
    </button>
  );
}

function shouldKeepExpandedArticleOpen(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return Boolean(
    target.closest(
      "button,a,input,textarea,select,[role='button'],[data-longform-keep-open]",
    ),
  );
}

function shouldKeepLongformTocOpen(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return Boolean(target.closest("#longform-article-toc,[data-longform-toc-trigger]"));
}

function LongformDigestPreview({
  articleKey,
  digest,
  isOpen,
  title,
  onToggle,
  renderTextSegment,
  children,
}: {
  articleKey: string;
  digest: LongformDigest;
  isOpen: boolean;
  title: string;
  onToggle: () => void;
  renderTextSegment?: (text: string, keyPrefix: string) => ReactNode;
  children?: ReactNode;
}) {
  const hasDigest = Boolean(digest.summary || digest.points.length > 0);

  if (!hasDigest && !children) return null;

  return (
    <div
      data-longform-keep-open
      className={[
        "mt-0 overflow-hidden rounded-md border text-[14px] leading-6 transition-colors duration-200",
        isOpen
          ? "border-[#d1d5db] bg-[#fcfcfd]"
          : "border-[#f3f4f6] bg-[#fcfcfd] hover:border-[#d1d5db]",
      ].join(" ")}
    >
      {hasDigest ? (
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "收起全文" : "展开全文"}：${title}`}
          onClick={onToggle}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onToggle();
          }}
          className="group cursor-pointer px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30"
        >
          <div className="flex w-full min-w-0 items-start gap-3">
            <div className="min-w-0 flex-1">
              {digest.summary ? (
                <p className="m-0 max-w-[70ch] break-words font-medium text-[#101828]">
                  <MathInlineText text={digest.summary} renderTextSegment={renderTextSegment} />
                </p>
              ) : null}

              {digest.points.length > 0 ? (
                <ol className="m-0 mt-2.5 flex max-w-[70ch] list-none flex-col gap-2.5 p-0">
                  {digest.points.map((point, pointIndex) => (
                    <li
                      key={`${articleKey}-point-${pointIndex}`}
                      className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2.5 text-[#4b5563]"
                    >
                      <span
                        className="mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#e5e7eb] text-[10px] font-semibold leading-none text-[#d7a220] tabular-nums"
                        aria-hidden
                      >
                        {pointIndex + 1}
                      </span>
                      <span className="min-w-0 break-words">
                        <MathInlineText text={point} renderTextSegment={renderTextSegment} />
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
            <span className="ml-auto mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center text-[#99a1af] transition-colors group-hover:text-[#101828]">
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
                  d={isOpen ? "m6 9 6 6 6-6" : "m9 6 6 6-6 6"}
                />
              </svg>
            </span>
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function LongformCollapse({
  isOpen,
  children,
}: {
  isOpen: boolean;
  children: ReactNode;
}) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const frame = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(frame);
    }

    setIsVisible(false);
    const timeout = window.setTimeout(() => setShouldRender(false), 320);
    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div
      aria-hidden={!isOpen}
      className={[
        "grid overflow-hidden motion-reduce:transition-none",
        "transition-[grid-template-rows,opacity] duration-300 ease-out",
        isVisible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      ].join(" ")}
    >
      <div className="min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function LongformBodyReader({
  articleKey,
  bodyBlocks,
  renderTextSegment,
}: {
  articleKey: string;
  bodyBlocks: LongformBodyBlock[];
  renderTextSegment?: (text: string, keyPrefix: string) => ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-[76ch] flex-col">
      <div className="flex flex-col">
        {bodyBlocks.map((block, blockIndex) => {
          if (block.kind === "heading") {
            return (
              <h4
                key={`${articleKey}-body-${blockIndex}`}
                className={[
                  "m-0 max-w-[68ch] break-words text-[15px] font-semibold leading-7 text-[#101828]",
                  blockIndex > 0 ? "mt-9" : "",
                ].join(" ")}
              >
                <MathInlineText text={block.text} />
              </h4>
            );
          }

          if (block.kind === "list") {
            return (
              <div
                key={`${articleKey}-body-${blockIndex}`}
                className={[
                  "m-0 flex flex-col gap-2 rounded-md bg-[#f5f5f5] px-4 py-3 text-[13px] leading-6 text-[#374151] sm:text-[14px]",
                  blockIndex > 0 ? "mt-5" : "",
                ].join(" ")}
                role="list"
              >
                {block.items.map((item, itemIndex) => (
                  <div
                    key={`${articleKey}-body-${blockIndex}-${itemIndex}`}
                    className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2.5"
                    role="listitem"
                  >
                    <span className="pt-[1px] text-[11px] font-semibold leading-6 text-[#99a1af] tabular-nums">
                      {block.ordered ? itemIndex + 1 : "•"}
                    </span>
                    <span className="min-w-0 break-words">
                      <MathInlineText text={item} renderTextSegment={renderTextSegment} />
                    </span>
                  </div>
                ))}
              </div>
            );
          }

          const score = scoreBodyReadingBlock(block, blockIndex, bodyBlocks.length);
          const isFocus = score >= BODY_FOCUS_SCORE + 0.7;
          const isLead = blockIndex <= 1 && block.text.length > 80 && !isFocus;

          return (
            <div
              key={`${articleKey}-body-${blockIndex}`}
              className={[
                "max-w-[70ch]",
                blockIndex > 0 ? (isFocus ? "mt-6" : "mt-4") : "",
                isFocus ? "border-l border-[#e5e7eb] py-2 pl-4 pr-3" : "",
              ].join(" ")}
            >
              <MathBlockText
                text={block.text}
                textClassName={[
                  "m-0 break-words [text-wrap:pretty]",
                  isFocus
                    ? "text-[14px] font-medium leading-7 text-[#101828] sm:text-[15px] sm:leading-[30px]"
                    : isLead
                      ? "text-[15px] font-medium leading-[30px] text-[#101828] sm:text-[16px] sm:leading-8"
                      : "text-[14px] leading-7 text-[#374151] sm:text-[15px] sm:leading-[30px]",
                ].join(" ")}
                renderTextSegment={renderTextSegment}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LongformArticleToc({
  items,
  activeId,
  onSelect,
  onClose,
}: {
  items: LongformTocItem[];
  activeId: string | null;
  onSelect: (item: LongformTocItem) => void;
  onClose: () => void;
}) {
  const tocRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<LongformTocDragState | null>(null);
  const userMovedRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState<LongformTocPosition | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const getDefaultPosition = () => {
      const contentCol = document.getElementById("layout-content-col");
      const longformSection = document.getElementById(LONGFORM_SECTION_ID);
      const longformHeader = document.getElementById(LONGFORM_HEADER_ID);
      const rect = tocRef.current?.getBoundingClientRect();
      const tocWidth = Math.min(LONGFORM_TOC_WIDTH, window.innerWidth - LONGFORM_TOC_MARGIN * 2);
      const tocHeight = rect?.height || 420;
      const top = longformHeader
        ? Math.round(longformHeader.getBoundingClientRect().bottom)
        : longformSection
          ? Math.round(longformSection.getBoundingClientRect().top)
        : LONGFORM_TOC_DEFAULT_TOP;

      if (!contentCol) {
        return clampLongformTocPosition({ left: LONGFORM_TOC_MARGIN, top }, tocWidth, tocHeight);
      }

      const contentRect = contentCol.getBoundingClientRect();
      const contentStyle = window.getComputedStyle(contentCol);
      const paddingLeft = Number.parseFloat(contentStyle.paddingLeft) || 0;
      const contentLeft = contentRect.left + paddingLeft;

      return clampLongformTocPosition(
        {
          left: Math.round(contentLeft - LONGFORM_TOC_GAP - tocWidth),
          top,
        },
        tocWidth,
        tocHeight,
      );
    };

    setPosition((current) => current ?? getDefaultPosition());

    const handleResize = () => {
      const rect = tocRef.current?.getBoundingClientRect();
      setPosition((current) =>
        current
          ? clampLongformTocPosition(current, rect?.width || LONGFORM_TOC_WIDTH, rect?.height || 420)
          : getDefaultPosition(),
      );
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [mounted]);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const nextPosition = clampLongformTocPosition(
        {
          left: event.clientX - dragState.offsetX,
          top: event.clientY - dragState.offsetY,
        },
        dragState.width,
        dragState.height,
      );
      setPosition(nextPosition);
    };

    const handlePointerEnd = () => {
      dragStateRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [isDragging]);

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const rect = tocRef.current?.getBoundingClientRect();
    if (!rect) return;

    event.preventDefault();
    userMovedRef.current = true;
    dragStateRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
    setIsDragging(true);
  };

  const handleDragKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!position) return;

    const step = event.shiftKey ? 48 : 16;
    const deltaByKey: Record<string, LongformTocPosition> = {
      ArrowLeft: { left: -step, top: 0 },
      ArrowRight: { left: step, top: 0 },
      ArrowUp: { left: 0, top: -step },
      ArrowDown: { left: 0, top: step },
    };
    const delta = deltaByKey[event.key];
    if (!delta) return;

    event.preventDefault();
    userMovedRef.current = true;
    const rect = tocRef.current?.getBoundingClientRect();
    const nextPosition = clampLongformTocPosition(
      {
        left: position.left + delta.left,
        top: position.top + delta.top,
      },
      rect?.width || LONGFORM_TOC_WIDTH,
      rect?.height || 420,
    );
    setPosition(nextPosition);
  };

  if (!mounted) return null;
  if (!position) return null;
  if (items.length === 0) return null;

  return createPortal(
    <nav
      id="longform-article-toc"
      ref={tocRef}
      className={[
        "modal-panel modal-panel-enter fixed z-[60] flex w-72 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-0",
        isDragging ? "cursor-grabbing select-none shadow-md" : "shadow-sm",
      ].join(" ")}
      style={{
        left: position.left,
        top: position.top,
        maxHeight: `calc(100vh - ${position.top + LONGFORM_TOC_MARGIN}px)`,
      }}
      aria-label="长文目录"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <div
          className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30 active:cursor-grabbing"
          role="button"
          tabIndex={0}
          aria-label="移动文章目录"
          onPointerDown={handleDragStart}
          onKeyDown={handleDragKeyDown}
        >
            <svg
              className="h-4 w-4 shrink-0 text-[#99a1af]"
              fill="currentColor"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path d="M5 3.5A1.5 1.5 0 1 1 3.5 2 1.5 1.5 0 0 1 5 3.5Zm0 4.5a1.5 1.5 0 1 1-1.5-1.5A1.5 1.5 0 0 1 5 8Zm0 4.5A1.5 1.5 0 1 1 3.5 11 1.5 1.5 0 0 1 5 12.5Zm7.5-7.5A1.5 1.5 0 1 0 11 3.5 1.5 1.5 0 0 0 12.5 5Zm0 4.5A1.5 1.5 0 1 0 11 8a1.5 1.5 0 0 0 1.5 1.5Zm0 4.5A1.5 1.5 0 1 0 11 12.5a1.5 1.5 0 0 0 1.5 1.5Z" />
            </svg>
            <p className="m-0 min-w-0 truncate text-[15px] font-semibold leading-5 text-[#101828]">
              文章目录
            </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#f5f5f5] px-2.5 py-1 text-[12px] leading-4 text-[#6a7282]">
          {items.length} 篇
        </span>
        <button
          type="button"
          aria-label="关闭文章目录"
          onClick={onClose}
          className="btn-press inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#99a1af] transition-colors hover:bg-[#f3f4f6] hover:text-[#101828] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <ol className="m-0 flex min-h-0 flex-1 list-none flex-col gap-1.5 overflow-y-auto p-3">
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(item)}
                className={[
                  "group flex w-full min-w-0 items-start gap-3 rounded-md px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30",
                  active ? "bg-[#0055FF]/[0.08] text-[#101828]" : "text-[#6a7282] hover:bg-[#fcfcfd] hover:text-[#101828]",
                ].join(" ")}
              >
                <span
                  className={[
                    "mt-0.5 w-7 shrink-0 text-[13px] font-semibold leading-5 tabular-nums",
                    active ? "text-[#05f]" : "text-[#d7a220]",
                  ].join(" ")}
                >
                  {String(item.index + 1).padStart(2, "0")}
                </span>
                <span className="line-clamp-3 min-w-0 break-words text-[14px] leading-[22px]">
                  {formatTypography(item.title)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>,
    document.body,
  );
}

function MetadataItem({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-[18px] min-w-0 items-center text-[12px] leading-[18px] text-[#6a7282]">
      {children}
    </span>
  );
}

function MetadataDivider() {
  return (
    <span className="inline-flex min-h-[18px] items-center text-[12px] leading-[18px] text-[#99a1af]" aria-hidden>
      /
    </span>
  );
}

export default function LongformModule({
  posts,
  onAddArticle,
  analysisActivePostId = null,
  onAnalysisToggle,
  previewPostIds,
  fullLoadingPostIds,
  fullErrorByPostId,
  onRequestFullArticle,
  showFloatingToc = true,
}: LongformModuleProps) {
  const longformPosts = useMemo(() => getLongformPosts(posts), [posts]);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [activeTocId, setActiveTocId] = useState<string | null>(null);
  const tocItems = useMemo(
    () =>
      longformPosts.map((post, index) => ({
        id: getLongformArticleDomId(post.id),
        title: getArticleTitle(post),
        index,
      })),
    [longformPosts],
  );

  useEffect(() => {
    if (!activeTocId || tocItems.some((item) => item.id === activeTocId)) return;
    setActiveTocId(null);
  }, [activeTocId, tocItems]);

  useEffect(() => {
    if (!showFloatingToc) {
      setIsTocOpen(false);
    }
  }, [showFloatingToc]);

  useEffect(() => {
    if (!isTocOpen) return;

    const handleTocOutsidePointerDown = (event: PointerEvent) => {
      if (shouldKeepLongformTocOpen(event.target)) return;
      setIsTocOpen(false);
    };

    document.addEventListener("pointerdown", handleTocOutsidePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handleTocOutsidePointerDown);
    };
  }, [isTocOpen]);

  useEffect(() => {
    if (!openKey) return;

    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (shouldKeepExpandedArticleOpen(event.target)) return;
      setOpenKey(null);
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
    };
  }, [openKey]);

  const handleTocSelect = (item: LongformTocItem) => {
    setActiveTocId(item.id);
    const element = document.getElementById(item.id);
    if (!element) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  if (longformPosts.length === 0) {
    return (
      <section
        aria-label="优质长文"
        data-name="Premium longform"
        className="w-full min-w-0 py-16 text-center"
      >
        <h2 className="m-0 text-[16px] font-semibold leading-6 text-[#101828]">
          暂无长文
        </h2>
        <p className="m-0 mt-2 text-[13px] leading-5 text-[#6a7282]">
          近期整理的博客、媒体与研究文章会出现在这里。
        </p>
        <div className="mt-5 flex justify-center">
          <AddArticleButton onClick={onAddArticle} />
        </div>
      </section>
    );
  }

  return (
    <section
      id={LONGFORM_SECTION_ID}
      aria-label="优质长文"
      data-name="Premium longform"
      className="relative w-full min-w-0"
    >
      {showFloatingToc && isTocOpen ? (
        <LongformArticleToc
          items={tocItems}
          activeId={activeTocId}
          onSelect={handleTocSelect}
          onClose={() => setIsTocOpen(false)}
        />
      ) : null}
      <div
        id={LONGFORM_HEADER_ID}
        className="flex min-h-[58px] items-center justify-between gap-3 py-3"
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setIsTocOpen(true)}
            aria-expanded={showFloatingToc && isTocOpen}
            aria-controls="longform-article-toc"
            data-longform-toc-trigger
            className="btn-press m-0 inline-flex min-h-5 items-center rounded-md text-[15px] font-semibold leading-5 text-[#101828] transition-colors hover:text-[#05f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/30"
          >
            目录（{longformPosts.length}）
          </button>
        </div>
        <AddArticleButton onClick={onAddArticle} />
      </div>

      <div className="flex w-full min-w-0 flex-col">
        {longformPosts.map((post, index) => {
          const article = post.longform;
          const paragraphs = getParagraphs(article.translatedContent);
          const digest = buildLongformDigest(post, paragraphs);
          const title = getArticleTitle(post);
          const author = getArticleAuthor(post);
          const articleKey = getArticleKey(post);
          const articleId = getLongformArticleDomId(post.id);
          const isOpen = openKey === articleKey;
          const rawBodyBlocks = buildOptimizedBodyBlocks(paragraphs, title);
          const emphasisTerms = getLongformEmphasisTerms(title, rawBodyBlocks);
          const digestEmphasisTerms = getLongformDigestEmphasisTerms(title, digest, emphasisTerms);
          const bodyBlocks = expandKnownAcronymsInBlocks(rawBodyBlocks);
          const textAnnotationState: TextAnnotationState = {
            emphasisTotal: 0,
            emphasisByTerm: new Map(),
          };
          const digestTextAnnotationState: TextAnnotationState = {
            emphasisTotal: 0,
            emphasisByTerm: new Map(),
          };
          const renderDigestTextSegment = (text: string, keyPrefix: string) =>
            renderTextWithLongformAnnotations(
              text,
              `${articleKey}-digest-${keyPrefix}`,
              digestEmphasisTerms,
              digestTextAnnotationState,
              {
                total: DIGEST_EMPHASIS_TOTAL_LIMIT,
                perTerm: DIGEST_EMPHASIS_PER_TERM_LIMIT,
              },
            );
          const renderBodyTextSegment = (text: string, keyPrefix: string) =>
            renderTextWithLongformAnnotations(
              text,
              `${articleKey}-${keyPrefix}`,
              emphasisTerms,
              textAnnotationState,
            );
          const isPreview = previewPostIds?.has(post.id) ?? false;
          const isFullLoading = fullLoadingPostIds?.has(post.id) ?? false;
          const fullError = fullErrorByPostId?.[post.id] ?? "";
          const analysisActive = analysisActivePostId === post.id;
          const sourceHost = getHostLabel(article.resolvedUrl) || getHostLabel(post.source.url);
          const sourceUrl = isHttpUrl(article.resolvedUrl)
            ? article.resolvedUrl
            : isHttpUrl(post.source.url)
              ? post.source.url
              : null;
          const openArticle = () => {
            if (isOpen) return;
            setActiveTocId(articleId);
            setOpenKey(articleKey);
            if (isPreview) void onRequestFullArticle?.(post.id);
          };
          const toggleArticle = () => {
            if (isOpen) {
              setOpenKey(null);
              return;
            }
            openArticle();
          };

          return (
            <article
              id={articleId}
              key={articleKey}
              onClick={(event) => {
                if (!isOpen || shouldKeepExpandedArticleOpen(event.target)) return;
                setOpenKey(null);
              }}
              className={[
                "scroll-mt-[88px] min-w-0 py-6 transition-colors sm:py-8",
                analysisActive ? "bg-[rgba(255,178,36,0.02)]" : "",
              ].join(" ")}
            >
              <div className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] gap-2 sm:grid-cols-[1.5rem_minmax(0,1fr)] sm:gap-3">
                <div
                  className="pt-2 text-left text-[11px] font-semibold leading-[18px] tabular-nums text-[#d7a220]"
                  aria-hidden
                >
                  {String(index + 1).padStart(2, "0")}
                </div>

                <div className="min-w-0">
                  <div className="rounded-md py-2" data-longform-keep-open>
                    <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 flex-wrap items-center gap-[4px]">
                        <span className="inline-flex min-h-[18px] shrink-0 items-center text-[12px] font-bold leading-[18px] text-[#d7a220]">
                          # {getCategoryTag(post.category)}
                        </span>
                        <MetadataDivider />
                        <MetadataItem>{formatTypography(author)}</MetadataItem>
                        <MetadataDivider />
                        <MetadataItem>{formatDateZH(post.publishedAt)}</MetadataItem>
                        <MetadataDivider />
                        <MetadataItem>{formatTimeLocalHM(post.publishedAt)}</MetadataItem>
                      </div>

                      {sourceHost && sourceUrl ? (
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[18px] min-w-0 shrink-0 items-center break-all text-[11px] font-normal leading-[18px] text-[#99a1af] transition-colors hover:text-[#6a7282] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
                        >
                          <span className="min-w-0 break-all">{sourceHost}</span>
                        </a>
                      ) : sourceHost ? (
                        <span className="inline-flex min-h-[18px] min-w-0 shrink-0 items-center break-all text-[11px] font-normal leading-[18px] text-[#99a1af]">
                          {sourceHost}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <h3 className="m-0 line-clamp-2 min-w-0 flex-1 break-words text-[22px] font-bold leading-[30px] text-[#101828]">
                        {formatTypography(title)}
                      </h3>
                      {onAnalysisToggle ? (
                        <div className="shrink-0 pt-0.5">
                          <LongformAnalysisButton
                            active={analysisActive}
                            title={title}
                            onClick={() => {
                              if (isPreview) void onRequestFullArticle?.(post.id);
                              onAnalysisToggle(post.id);
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <LongformDigestPreview
                    articleKey={articleKey}
                    digest={digest}
                    isOpen={isOpen}
                    title={title}
                    onToggle={toggleArticle}
                    renderTextSegment={renderDigestTextSegment}
                  >
                    <LongformCollapse isOpen={isOpen}>
                      <div data-longform-keep-open>
                      <div className="px-4 py-5 sm:px-6 sm:py-6">
                        {isPreview ? (
                          <div
                            className="flex min-h-[180px] max-w-[68ch] flex-col items-center justify-center gap-3 text-center"
                            role="status"
                            aria-live="polite"
                          >
                            <p className="m-0 text-[14px] font-semibold leading-5 text-[#101828]">
                              {fullError ? "全文加载失败" : "正在加载全文"}
                            </p>
                            <p className="m-0 max-w-[32rem] text-[13px] leading-5 text-[#6a7282]">
                              {fullError || (isFullLoading ? "正在读取正文。" : "正在准备正文。")}
                            </p>
                            {fullError ? (
                              <button
                                type="button"
                                className="btn-primary btn-press rounded-md px-4 py-2 text-sm font-medium"
                                onClick={() => void onRequestFullArticle?.(post.id)}
                              >
                                重试
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <LongformBodyReader
                            articleKey={articleKey}
                            bodyBlocks={bodyBlocks}
                            renderTextSegment={renderBodyTextSegment}
                          />
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 bg-[#fcfcfd] px-4 py-3 text-[12px] leading-[18px] sm:px-5">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                          {isHttpUrl(article.resolvedUrl) ? (
                            <a
                              href={article.resolvedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 font-medium text-primary-600 transition-colors hover:text-primary-700"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17 17 7m0 0H8m9 0v9" />
                              </svg>
                              阅读原文
                            </a>
                          ) : null}
                          {isHttpUrl(post.source.url) && post.source.url !== article.resolvedUrl ? (
                            <a
                              href={post.source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 font-medium text-[#6a7282] transition-colors hover:text-[#101828]"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 6H17a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-3.5M10 14 18 6m0 0h-5m5 0v5" />
                              </svg>
                              来源
                            </a>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="btn-press inline-flex h-8 shrink-0 items-center rounded-md px-2 text-[13px] font-semibold leading-none text-[#6a7282] transition-colors hover:bg-[#f3f4f6] hover:text-[#101828] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
                          aria-label={`收起全文：${title}`}
                          onClick={() => setOpenKey(null)}
                        >
                          收起
                        </button>
                      </div>
                    </div>
                    </LongformCollapse>
                  </LongformDigestPreview>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
