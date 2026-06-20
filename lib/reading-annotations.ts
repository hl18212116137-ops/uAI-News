export type ReadingContentBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

export type ReadingFacet = "problem" | "method" | "finding" | "risk" | "impact";

export type ReadingBlockAnnotation = {
  facet?: ReadingFacet;
  claim?: string;
  emphasisTerms: string[];
};

const SENTENCE_RE = /[^。！？!?；;.\n]+[。！？!?；;.]?/g;
const METRIC_RE =
  /(?:[$¥€£]?\d+(?:\.\d+)?\s?(?:%|倍|x|X|个|项|年|月|日|天|小时|分钟|秒|万|亿|千|百万|K|M|B|tokens?|parameters?|users?|days?|hours?|minutes?|seconds?)|(?:第一|首次|唯一|最大|最小|最高|最低|最多|最少|first|only|largest|smallest|highest|lowest|most|least))/gi;
const TECH_TERM_RE =
  /\b(?:[A-Z]{2,}[A-Za-z0-9-]*|[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+|[A-Z][A-Za-z]+(?:Bench|Code|Net|GPT|LM|AI|WM|V)\d*(?:\.\d+)?|[A-Z][A-Za-z]+[A-Z][A-Za-z0-9]+|[A-Z][A-Za-z]+\s+[A-Z]?\d+(?:\.\d+)?)\b/g;
const CHINESE_CONCEPT_RE =
  /[\u4e00-\u9fffA-Za-z0-9-]{2,24}(?:语言模型|世界模型|状态空间模型|通用人工智能|人工智能|强化学习|监督微调|自蒸馏|可验证推理|推理模型|模型|框架|方法|系统|算法|架构|数据集|基准|任务|推理|训练|微调|知识|能力|假说|机制|风险|限制|成本|效率|参数|结论|发现)/g;

const PROBLEM_RE =
  /(问题|矛盾|挑战|难题|瓶颈|局限|不足|痛点|缺口|难以|很难|无法|不能|没有|缺少|不稳定|误差|偏差|错觉|低估|高估|危险|威胁|面临|困境|成本高昂|部署成本高|problem|challenge|trade-off|bottleneck|limitation|error|gap)/i;
const FINDING_RE =
  /(发现|结果(表明|显示|说明|是)|表明|显示|证明|相比|优于|超过|达到|提升|提高|降低|减少|增加|显著|实现了|found|results? (show|suggest|indicate)|show|suggest|indicate|demonstrate|outperform|achieve|improve|significant)/i;
const RISK_RE =
  /(风险|限制|局限|不足|失败|误差|偏差|依赖|仍然|不能|不应|瓶颈|问题在于|但[^。！？!?；;]{0,64}(仍然|不能|难以|无法|风险|限制|依赖)|limitation|risk|bias|fail|error|depend|still|cannot|should not)/i;
const IMPACT_RE =
  /(意味着|启示|影响|价值|机会|会让|将使|换句话说|这背后真正有价值|因此[^。！？!?；;]{0,48}(意味着|带来|需要|可以|应该)|由此[^。！？!?；;]{0,48}(可见|带来|需要|可以|应该)|this means|therefore|impact|implication|value|opportunity|suggests that)/i;
const LOW_VALUE_RE =
  /(欢迎|点赞|收藏|转发|关注|订阅|评论区|分享给|如果你觉得|谢谢|感谢|参考文献|致谢|copyright|all rights reserved|references|acknowledg(e)?ments)/i;

const FACET_LABELS: Record<ReadingFacet, string> = {
  problem: "问题",
  method: "方法",
  finding: "发现",
  risk: "限制",
  impact: "影响",
};

const STOP_TERMS = new Set([
  "AI",
  "API",
  "URL",
  "PDF",
  "HTML",
  "The",
  "This",
  "That",
  "These",
  "Those",
  "Figure",
  "Table",
  "Abstract",
  "Introduction",
  "Conclusion",
  "方法",
  "模型",
  "系统",
  "能力",
  "问题",
  "结果",
]);

type Candidate = {
  text: string;
  score: number;
  count: number;
};

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeTerm(term: string): string {
  return term
    .replace(/^[\s"'“”‘’《》「」()[\]{}【】,，.。:：;；!?！？]+/, "")
    .replace(/[\s"'“”‘’《》「」()[\]{}【】,，.。:：;；!?！？]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactChineseConcept(raw: string): string {
  let clean = normalizeTerm(raw);
  if (!/[\u4e00-\u9fff]/.test(clean)) return clean;

  const splitters = /(把|将|让|使|对|为|与|和|及|或|但|而|在|从|用|通过|基于|采用|引入|提出|构建|设计|解决|依赖|包括|一些|这个|那个|该|其|作者|团队|本文|研究|文章|方法上)/g;
  const pieces = clean
    .split(splitters)
    .map((piece) => normalizeTerm(piece))
    .filter(Boolean);
  const tail = [...pieces].reverse().find((piece) =>
    /(语言模型|世界模型|状态空间模型|通用人工智能|人工智能|强化学习|监督微调|自蒸馏|可验证推理|推理模型|模型|框架|方法|系统|算法|架构|数据集|基准|任务|推理|训练|微调|知识|能力|假说|机制|风险|限制|成本|效率|参数|结论|发现)$/.test(piece),
  );
  clean = tail ?? clean;
  clean = clean.replace(/^(?:的|了|也|能|可以|能够|仍然|已经|更大|更小|高难|复杂)+/, "");

  if (clean.length > 14 && !hasMetric(clean)) return "";
  return clean;
}

function termKey(term: string): string {
  return normalizeTerm(term).toLowerCase();
}

function isUsefulTerm(term: string): boolean {
  const clean = normalizeTerm(term);
  if (clean.length < 2 || clean.length > 38) return false;
  if (STOP_TERMS.has(clean)) return false;
  if (/^https?:\/\//i.test(clean)) return false;
  if (/^[\d\s.,+-]+$/.test(clean)) return false;
  if (/[。！？!?；;]/.test(clean)) return false;
  return /[\u4e00-\u9fffA-Za-z0-9]/.test(clean);
}

function addCandidate(candidates: Map<string, Candidate>, raw: string, score: number) {
  const text = compactChineseConcept(raw);
  if (!isUsefulTerm(text)) return;

  const key = termKey(text);
  const current = candidates.get(key);
  if (current) {
    current.score += score;
    current.count += 1;
    return;
  }

  candidates.set(key, { text, score, count: 1 });
}

function collectTerms(candidates: Map<string, Candidate>, text: string, score: number) {
  for (const re of [METRIC_RE, TECH_TERM_RE, CHINESE_CONCEPT_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      addCandidate(candidates, match[0], score);
    }
  }
}

function blockText(block: ReadingContentBlock): string {
  return block.kind === "list" ? block.items.join(" ") : block.text;
}

function selectGlobalTerms(blocks: ReadingContentBlock[], title: string): string[] {
  const candidates = new Map<string, Candidate>();
  collectTerms(candidates, title, 3);

  blocks.forEach((block, index) => {
    const text = blockText(block);
    collectTerms(candidates, text, index <= 1 ? 1.5 : 1);
  });

  return [...candidates.values()]
    .map((candidate) => ({
      ...candidate,
      score: candidate.score + Math.min(candidate.count, 4) * 0.35 + Math.min(candidate.text.length, 18) * 0.03,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 14)
    .map((candidate) => candidate.text);
}

function getSentences(text: string): string[] {
  return normalizeText(text).match(SENTENCE_RE)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
}

function hasMetric(text: string): boolean {
  METRIC_RE.lastIndex = 0;
  return METRIC_RE.test(text);
}

function isDefinitionBlock(text: string): boolean {
  const clean = normalizeText(text);
  if (clean.length > 180) return false;

  return /^[\u4e00-\u9fffA-Za-z0-9@_.+-]{1,32}\s*[：:]/.test(clean);
}

function isInventoryBlock(text: string): boolean {
  const clean = normalizeText(text);
  if (clean.length > 220) return false;

  const separators = (clean.match(/[、，,]/g) ?? []).length;
  const sentences = getSentences(clean).length;
  return separators >= 4 && sentences <= 1;
}

function isMetaQuestionBlock(text: string): boolean {
  const clean = normalizeText(text);
  if (clean.length > 120) return false;

  return /解决什么问题/.test(clean) && /(产出什么结果|怎么使用|别人用得怎么样)/.test(clean);
}

function scoreClaimSentence(sentence: string, sentenceIndex: number, sentenceCount: number): number {
  const clean = normalizeText(sentence);
  if (isDefinitionBlock(clean) || isInventoryBlock(clean) || isMetaQuestionBlock(clean)) return -4;
  if (clean.length < 18 || clean.length > 160) return -1;
  if (LOW_VALUE_RE.test(clean)) return -4;

  let score = 0;
  if (FINDING_RE.test(clean)) score += 3;
  if (RISK_RE.test(clean)) score += 2.4;
  if (IMPACT_RE.test(clean)) score += 2.2;
  if (PROBLEM_RE.test(clean) && sentenceIndex <= 1) score += 1.5;
  if (hasMetric(clean)) score += 1.2;
  if (/不是.+而是|并非.+而是|rather than|not .+ but/i.test(clean)) score += 1.2;
  if (sentenceIndex === 0) score += 0.3;
  if (sentenceIndex === sentenceCount - 1) score += 0.4;
  if (clean.length > 110) score -= 0.5;

  return score;
}

function selectClaim(text: string): string | undefined {
  const sentences = getSentences(text);
  if (sentences.length === 0) return undefined;

  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      score: scoreClaimSentence(sentence, index, sentences.length),
    }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score >= 3.4 ? ranked[0].sentence : undefined;
}

function hasMethodSignal(text: string): boolean {
  const sentences = getSentences(text);

  return sentences.some((sentence) => {
    const clean = normalizeText(sentence);
    if (!clean) return false;
    if (/^(方法|方法上|实验|评测|测试|流程|步骤)[:：，,]/.test(clean)) return true;
    if (/系统性地/.test(clean) && /(增强|评估|验证|测试|训练|研究)/.test(clean)) return true;
    if (/(我们|本文|作者|报告)[^。！？!?；;]{0,48}(提出|引入|采用|构建|设计|评测|测试|解决|验证|评估|研究)/.test(clean)) {
      return true;
    }
    if (/(提出|引入|采用|构建)[^。！？!?；;]{0,24}(方法|模型|框架|系统|流程|架构)/.test(clean)) {
      return /(我们|本文|作者|报告|方法|实验|评测|测试)/.test(clean);
    }
    if (/通过[^。！？!?；;]{0,48}(解决|实现|验证|评估)/.test(clean)) {
      return /(我们|本文|方法|模型|系统|流程|实验|评测|测试)/.test(clean);
    }
    return /we (propose|present|introduce|design|evaluate)|method|framework|architecture|experiment|benchmark|dataset/i.test(clean);
  });
}

function chooseFacet(text: string): ReadingFacet | undefined {
  const clean = normalizeText(text);
  if (isDefinitionBlock(clean) || isInventoryBlock(clean) || isMetaQuestionBlock(clean)) return undefined;

  const sentences = getSentences(clean).slice(0, 4);
  const scored = (sentences.length > 0 ? sentences : [clean]).flatMap((sentence, index) => {
    const part = normalizeText(sentence);
    const positionScore = index === 0 ? 0.7 : -index * 0.55;
    const explicitRisk = /^(限制|风险|局限|不足|问题在于|但|不过|然而|值得注意)/.test(part);

    return [
      { facet: "problem" as const, score: PROBLEM_RE.test(part) ? 2.7 + positionScore : 0 },
      { facet: "method" as const, score: hasMethodSignal(part) ? 3.1 + positionScore : 0 },
      { facet: "finding" as const, score: FINDING_RE.test(part) ? 3 + positionScore : 0 },
      { facet: "risk" as const, score: RISK_RE.test(part) ? (explicitRisk ? 3.2 : 2.5) + positionScore : 0 },
      { facet: "impact" as const, score: IMPACT_RE.test(part) ? 2.6 + positionScore : 0 },
    ];
  });

  scored.sort((a, b) => b.score - a.score);

  return scored[0] && scored[0].score >= 2.45 ? scored[0].facet : undefined;
}

function textIncludesTerm(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
}

function getBlockTerms(text: string, globalTerms: string[], claim?: string): string[] {
  const local = new Map<string, Candidate>();
  collectTerms(local, text, 1.8);
  const terms = new Map<string, { score: number; text: string }>();
  for (const term of globalTerms) {
    if (!textIncludesTerm(text, term)) continue;
    terms.set(termKey(term), { text: term, score: 2 + (hasMetric(term) ? 2 : 0) });
  }
  for (const item of local.values()) {
    const key = termKey(item.text);
    const score = item.score + (hasMetric(item.text) ? 2.5 : 0);
    const current = terms.get(key);
    if (!current || score > current.score) {
      terms.set(key, { text: item.text, score });
    }
  }
  const budget = claim ? 1 : 2;

  return [...terms.values()]
    .filter((item) => {
      if (!claim) return true;
      return !claim.toLowerCase().includes(item.text.toLowerCase()) || hasMetric(item.text);
    })
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length)
    .slice(0, budget)
    .map((item) => item.text);
}

export function getReadingFacetLabel(facet: ReadingFacet): string {
  return FACET_LABELS[facet];
}

export function buildReadingAnnotationPlan(
  blocks: ReadingContentBlock[],
  title = "",
): ReadingBlockAnnotation[] {
  const globalTerms = selectGlobalTerms(blocks, title);
  let claimCount = 0;
  let lastClaimBlockIndex = -4;

  return blocks.map((block, blockIndex) => {
    const text = blockText(block);
    const facet = block.kind === "paragraph" || block.kind === "list" ? chooseFacet(text) : undefined;
    const nextClaim =
      block.kind === "paragraph" && claimCount < 6 && blockIndex - lastClaimBlockIndex >= 3
        ? selectClaim(text)
        : undefined;
    const claim = nextClaim;

    if (claim) {
      claimCount += 1;
      lastClaimBlockIndex = blockIndex;
    }

    return {
      facet,
      claim,
      emphasisTerms: getBlockTerms(text, globalTerms, claim),
    };
  });
}
