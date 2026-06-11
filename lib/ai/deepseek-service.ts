import { AIService, AIProcessedContent, PostInsightContext } from './ai-service';
import { DEFAULT_INSIGHT_PERSONA } from '../insight-defaults';
import { NewsCategory } from '../types';
import { SemanticFingerprint, SimilarityResult } from '../deduplication/types';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

const VALID_CATEGORIES: NewsCategory[] = [
  '模型',
  '产品',
  '研究',
  '行业',
  '政策',
];

export class DeepSeekService implements AIService {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || '';
    this.model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    if (!this.apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }
  }

  private async callAPI(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices?.[0]?.message?.content) {
      console.error('[DeepSeek] Unexpected response:', JSON.stringify(data).slice(0, 500));
      throw new Error('Invalid response format from DeepSeek API');
    }

    return data.choices[0].message.content;
  }

  getProviderName(): string {
    return 'deepseek';
  }

  async processNews(
    text: string,
    authorName: string,
    authorHandle: string
  ): Promise<AIProcessedContent> {
    const prompt = `你是一个AI新闻筛选和分析专家。请分析以下英文推文，判断是否值得展示给关注AI行业的用户。

推文内容：
${text}

作者：${authorName} (@${authorHandle})

请严格按照以下JSON格式返回（不要包含任何其他文字）：

{
  "important": true/false,
  "title": "中文标题",
  "summary": "中文摘要",
  "category": "分类"
}

判断标准（important字段）：
✅ 值得展示（important: true）：
- 重要的产品/模型发布或更新
- 有实质内容的技术突破、研究成果
- 重大的公司动态、融资、合作
- 有影响力的政策法规
- 有价值的开源项目发布

❌ 不值得展示（important: false）：
- 纯粹的感谢、祝贺、问候
- 个人观点、鸡汤、励志语录、抽奖活动、泛泛闲聊
- 无实质内容的宣传
- 纯转发、纯链接；或转发/引用但作者几乎无评论
- 模糊不清、信息量极少的内容

标题要求（10-20字）：用大白话、口语化的表达
摘要要求（30-80字）：用通俗易懂的大白话

分类规则（category必须精确匹配以下中文值）：
- "模型" - 模型更新、发布、评测
- "产品" - 产品功能、工具发布、开源项目
- "研究" - 论文、实验、技术突破
- "行业" - 公司动态、融资、收购、行业趋势
- "政策" - 政策法规、监管、AI 安全治理

硬性要求：title 与 summary 必须以简体中文为主。
注意：即使判断为不重要（important: false），也要填写所有字段。`;

    try {
      const responseText = await this.callAPI(prompt);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in AI response');

      const parsed = JSON.parse(jsonMatch[0]);
      if (!VALID_CATEGORIES.includes(parsed.category)) {
        parsed.category = '行业';
      }

      return {
        important: parsed.important === true,
        title: parsed.title || '未命名新闻',
        summary: parsed.summary || '暂无摘要',
        category: parsed.category,
      };
    } catch (error) {
      console.error('DeepSeek processNews error:', error);
      throw error;
    }
  }

  async translateContent(content: string): Promise<string> {
    const prompt = `请将以下内容译为简体中文（若已是中文则理顺语序即可）。要求：
1. 准确传达原意
2. 以简体中文为主输出
3. 专有名词、模型名可保留常见英文缩写
4. 只返回译文正文，不要解释、不要前缀

原文：
${content}`;

    try {
      const translatedText = await this.callAPI(prompt);
      return translatedText.trim().replace(
        /^(以下是翻译[：:]\s*|翻译[：:]\s*|让我(来)?翻译[^：:\n]*[：:]\s*|Translation[：:]\s*)/i,
        ''
      ).trim();
    } catch (error) {
      console.error('DeepSeek translateContent error:', error);
      throw error;
    }
  }

  async summarizeAuthorBio(
    rawBio: string,
    authorName: string,
    authorHandle: string
  ): Promise<string> {
    const prompt = `为以下博主生成简洁的中文简介摘要（15-30字）。

博主：${authorName} (@${authorHandle})
原始简介：${rawBio}

要求：提取核心身份和专业领域，去除URL和表情符号，只返回简介文字。
示例："OpenAI CEO，致力于通用人工智能研究"`;

    try {
      const summary = await this.callAPI(prompt);
      return summary.trim().replace(/^["'"""'']+|["'"""'']+$/g, '');
    } catch (error) {
      console.error('DeepSeek summarizeAuthorBio error:', error);
      return rawBio.substring(0, 30).replace(/https?:\/\/\S+/g, '').trim();
    }
  }

  async scoreNewsImportance(newsItem: {
    title: string;
    summary: string;
    content: string;
    category: NewsCategory;
    authorName: string;
    authorHandle: string;
    publishedAt: string;
  }): Promise<number> {
    const prompt = `评估以下AI新闻的重要性，返回0-100的整数评分。

标题：${newsItem.title}
摘要：${newsItem.summary}
分类：${newsItem.category}
作者：${newsItem.authorName} (@${newsItem.authorHandle})

评分参考：重大模型/产品发布 85-100，技术突破 80-95，重要融资 75-90，一般更新 40-70，低信息量 0-39。
请只返回一个整数，不要其他文字。`;

    try {
      const responseText = await this.callAPI(prompt);
      const score = parseInt(responseText.trim(), 10);
      if (isNaN(score) || score < 0 || score > 100) return 50;
      return score;
    } catch (error) {
      console.error('DeepSeek scoreNewsImportance error:', error);
      return 50;
    }
  }

  async generateSemanticFingerprint(newsItem: {
    title: string;
    summary: string;
    authorHandle: string;
  }): Promise<SemanticFingerprint> {
    const prompt = `分析这条AI新闻，提取结构化信息：

标题：${newsItem.title}
摘要：${newsItem.summary}
作者：@${newsItem.authorHandle}

请严格按JSON返回：
{
  "mainTopic": "3-5词概括",
  "entities": { "people": [...], "companies": [...], "products": [...], "concepts": [...] },
  "eventType": "announcement/discussion/analysis/reaction"
}`;

    try {
      const responseText = await this.callAPI(prompt);
      const cleanedText = responseText.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const fingerprint = JSON.parse(cleanedText) as SemanticFingerprint;
      if (!fingerprint.mainTopic || !fingerprint.entities || !fingerprint.eventType) {
        throw new Error('Invalid fingerprint structure');
      }
      return fingerprint;
    } catch (error) {
      console.error('DeepSeek generateSemanticFingerprint error:', error);
      return {
        mainTopic: newsItem.title.substring(0, 20),
        entities: { people: [], companies: [], products: [], concepts: [] },
        eventType: 'discussion'
      };
    }
  }

  async compareSimilarityBatch(
    posts: Array<{ id: string; title: string; summary: string; authorHandle: string }>
  ): Promise<SimilarityResult[]> {
    if (posts.length < 2) return [];

    const postsList = posts.map((p, i) =>
      `[${i}] ID:${p.id} | ${p.title} - ${p.summary} (by @${p.authorHandle})`
    ).join('\n');

    const prompt = `比较以下新闻是否讨论同一事件/话题，返回相似度>=60的配对。

新闻列表：
${postsList}

请严格按JSON数组返回（用实际ID，不用索引号）：
[{"id1": "实际ID", "id2": "实际ID", "similarity": 85, "reason": "原因"}]
没有相似配对返回 []。`;

    try {
      const responseText = await this.callAPI(prompt);
      const cleanedText = responseText.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const results = JSON.parse(cleanedText) as SimilarityResult[];
      if (!Array.isArray(results)) throw new Error('Invalid structure');
      return results.filter(r =>
        r.id1 && r.id2 && typeof r.similarity === 'number' && r.similarity >= 0 && r.similarity <= 100
      );
    } catch (error) {
      console.error('DeepSeek compareSimilarityBatch error:', error);
      return [];
    }
  }

  async analyzePost(
    text: string,
    authorName: string,
    authorHandle: string,
    insightContext?: PostInsightContext,
    referencedPost?: import('../types').XReferencedPost | null
  ): Promise<import('../types').PostAnalysis> {
    const persona =
      (insightContext?.persona && insightContext.persona.trim()) || DEFAULT_INSIGHT_PERSONA;
    const sourcesLines = insightContext?.subscribedSourcesLines?.trim() ?? '';
    const sourcesSection = sourcesLines
      ? `用户常看的信息源（名称与 @handle）：\n${sourcesLines}`
      : '用户常看的信息源：暂无订阅列表。';

    const ref =
      referencedPost?.text?.trim() && referencedPost ? referencedPost : null;
    const refAuthorLine =
      ref && (ref.name || ref.userName)
        ? [ref.name?.trim(), ref.userName ? `@${String(ref.userName).replace(/^@/, '')}` : '']
            .filter(Boolean).join(' ')
        : '（嵌套作者未知）';

    const bodyIntro = ref
      ? `推文结构：存在嵌套推文（${ref.kind === 'retweet' ? '转发' : '引用'}）。

发布者：${authorName} (@${authorHandle})

【主帖】：
${text.trim() || '（空）'}

【嵌套推文】作者：${refAuthorLine}
${ref.text}`
      : `推文内容：${text}
作者：${authorName} (@${authorHandle})`;

    const hlDesc =
      '字符串数组，**2～3 条，最多 3 条**。用大白话写，像跟朋友聊天，每条 15-25 字。不要用术语和行话，把专业概念翻译成普通人能懂的话。**加粗**仅用于最关键的名词/数字，每条最多 1 处；避免与译文逐句重复';

    const translationRules = ref
      ? `2. translatedText: 仅【主帖】的完整简体中文译文
3. translatedTextReferenced: 【嵌套推文】的完整简体中文译文
4. highlights: ${hlDesc}
5. entities: 实体列表
6. eventType: announcement/discussion/analysis/reaction/other
7. sourceType: official/media/expert/user
8. importanceScore: 0-100
9. noveltyScore: 0-100`
      : `2. translatedText: 必填。将推文全文完整译为简体中文（勿省略句段）。若原文已是中文则略润色
3. highlights: ${hlDesc}
4. entities: 实体列表
5. eventType: announcement/discussion/analysis/reaction/other
6. sourceType: official/media/expert/user
7. importanceScore: 0-100
8. noveltyScore: 0-100`;

    const prompt = `分析以下推文，提取关键信息：

${bodyIntro}

读者画像：${persona}
${sourcesSection}

**语言（强制）**：所有面向用户展示的字符串必须为**简体中文**；专有名词可保留外文。

请提取以下信息并以JSON格式返回：
1. canonicalSummary: 标准化摘要（50字以内）
${translationRules}

返回格式：
{
  "canonicalSummary": "...",
  "translatedText": "...",
${ref ? '  "translatedTextReferenced": "...",\n' : ''}  "highlights": ["要点一", "要点二"],
  "entities": ["...", "..."],
  "eventType": "announcement",
  "sourceType": "official",
  "importanceScore": 85,
  "noveltyScore": 90
}`;

    try {
      const responseText = await this.callAPI(prompt);
      const cleanedText = responseText.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const result = JSON.parse(cleanedText);

      const translatedText =
        typeof result.translatedText === 'string' && result.translatedText.trim() !== ''
          ? result.translatedText.trim()
          : undefined;

      let translatedTextReferenced: string | undefined;
      if (ref && typeof result.translatedTextReferenced === 'string' && result.translatedTextReferenced.trim() !== '') {
        translatedTextReferenced = result.translatedTextReferenced.trim();
      }

      let highlights: string[] | undefined;
      if (Array.isArray(result.highlights)) {
        const h = result.highlights
          .filter((x: unknown): x is string => typeof x === 'string')
          .map((s: string) => s.trim()).filter(Boolean).slice(0, 3);
        if (h.length > 0) highlights = h;
      }

      return {
        canonicalSummary: typeof result.canonicalSummary === 'string' ? result.canonicalSummary.trim() : '',
        translatedText,
        translatedTextReferenced,
        highlights,
        entities: Array.isArray(result.entities) ? result.entities : [],
        eventType: result.eventType || 'other',
        sourceType: result.sourceType || 'user',
        importanceScore: typeof result.importanceScore === 'number' ? result.importanceScore : 50,
        noveltyScore: typeof result.noveltyScore === 'number' ? result.noveltyScore : 50
      };
    } catch (error) {
      console.error('DeepSeek analyzePost error:', error);
      return {
        canonicalSummary: '',
        entities: [],
        eventType: 'other',
        sourceType: 'user',
        importanceScore: 50,
        noveltyScore: 50
      };
    }
  }
}
