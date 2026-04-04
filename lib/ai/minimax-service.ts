import { AIService, AIProcessedContent, PostInsightContext } from './ai-service';
import { DEFAULT_INSIGHT_PERSONA } from '../insight-defaults';
import { NewsCategory } from '../types';
import { SemanticFingerprint, SimilarityResult } from '../deduplication/types';

// MiniMax API 配置
const MINIMAX_API_URL = 'https://api.minimax.chat/v1/text/chatcompletion_v2';

// 有效的分类列表
const VALID_CATEGORIES: NewsCategory[] = [
  'Model Update',
  'Product Update',
  'Research',
  'Company News',
  'Funding',
  'Policy',
  'Open Source',
  'Other',
];

/**
 * MiniMax AI 服务实现
 */
export class MinimaxService implements AIService {
  private apiKey: string;
  private groupId: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.MINIMAX_API_KEY || '';
    this.groupId = process.env.MINIMAX_GROUP_ID || '';
    this.model = process.env.MINIMAX_MODEL || 'abab6.5-chat';

    if (!this.apiKey) {
      throw new Error('MINIMAX_API_KEY is not configured');
    }
  }

  /**
   * 调用 MiniMax API
   */
  private async callAPI(prompt: string): Promise<string> {
    const response = await fetch(MINIMAX_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        ...(this.groupId && { group_id: this.groupId }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from MiniMax API');
    }

    return data.choices[0].message.content;
  }

  /**
   * 处理新闻：生成中文标题、摘要和分类
   */
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
- 纯转发、纯链接；或转发/引用但作者几乎无评论、未增加信息，且嵌套原文本身信息量很低
- 模糊不清、信息量极少的内容

标题要求（10-20字）：
- 用大白话、口语化的表达，像跟朋友聊天一样
- 避免官方、正式的用词，多用日常用语
- 例如："OpenAI发布GPT-5"、"Claude现在能处理100万字了"、"谷歌买下一家AI公司"
- 不要用"显著提升"、"获得认可"这类官方词汇

摘要要求（30-80字）：
- 用通俗易懂的大白话，像给朋友讲故事
- 避免"表示"、"显示"、"标志着"等书面语
- 多用"说"、"觉得"、"挺好"、"很厉害"等口语词汇
- 直接说重点，不要绕弯子

分类规则（category必须精确匹配）：
- "Model Update" - 模型更新、新模型发布、模型能力提升
- "Product Update" - 产品功能更新、新产品发布
- "Research" - 研究论文、实验结果、技术突破
- "Company News" - 公司动态、合作伙伴关系、收购
- "Funding" - 融资、投资消息
- "Policy" - 政策法规、监管动态
- "Open Source" - 开源项目、代码发布
- "Other" - 其他类型

注意：即使判断为不重要（important: false），也要填写title、summary、category字段（可以简单填写）。`;

    try {
      const responseText = await this.callAPI(prompt);

      // 提取 JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 验证分类
      if (!VALID_CATEGORIES.includes(parsed.category)) {
        console.warn(`Invalid category "${parsed.category}", defaulting to "Other"`);
        parsed.category = 'Other';
      }

      return {
        important: parsed.important === true, // 确保是布尔值
        title: parsed.title || '未命名新闻',
        summary: parsed.summary || '暂无摘要',
        category: parsed.category,
      };
    } catch (error) {
      console.error('MiniMax processNews error:', error);
      throw error;
    }
  }

  /**
   * 翻译内容为中文
   */
  async translateContent(content: string): Promise<string> {
    const prompt = `请将以下英文内容翻译成简体中文。要求：
1. 准确传达原文意思
2. 保持专业、流畅的中文表达
3. 保留技术术语的准确性
4. 只返回翻译结果，不要任何额外说明

原文：
${content}`;

    try {
      const translatedText = await this.callAPI(prompt);
      // 去除 AI 可能输出的多余前缀
      const cleaned = translatedText.trim().replace(
        /^(以下是翻译[：:]\s*|翻译[：:]\s*|让我(来)?翻译[^：:\n]*[：:]\s*|Translation[：:]\s*)/i,
        ''
      ).trim();
      return cleaned;
    } catch (error) {
      console.error('MiniMax translateContent error:', error);
      throw error;
    }
  }

  /**
   * 生成博主简介摘要
   */
  async summarizeAuthorBio(
    rawBio: string,
    authorName: string,
    authorHandle: string
  ): Promise<string> {
    const prompt = `你是一个AI领域的内容编辑。请为以下博主生成一个简洁的中文简介摘要。

博主信息：
- 名称：${authorName}
- Handle：@${authorHandle}
- 原始简介：${rawBio}

要求：
1. 提取核心身份和专业领域（如"OpenAI CEO"、"AI研究员"、"深度学习专家"）
2. 去除URL链接、表情符号、营销性语言
3. 使用简洁的中文表达
4. 长度控制在15-30个汉字
5. 只返回简介文字，不要任何额外说明或标点

示例：
- "OpenAI CEO，致力于通用人工智能研究"
- "Meta首席AI科学家，深度学习先驱"
- "AI创业者，专注Agent技术"

请只返回简介文字：`;

    try {
      const summary = await this.callAPI(prompt);
      return summary.trim();
    } catch (error) {
      console.error('MiniMax summarizeAuthorBio error:', error);
      // 降级方案：返回简化的原始简介
      return rawBio.substring(0, 30).replace(/https?:\/\/\S+/g, '').trim();
    }
  }

  /**
   * 获取服务提供商名称
   */
  getProviderName(): string {
    return 'minimax';
  }

  /**
   * 评估新闻的重要性评分
   */
  async scoreNewsImportance(newsItem: {
    title: string;
    summary: string;
    content: string;
    category: import('../types').NewsCategory;
    authorName: string;
    authorHandle: string;
    publishedAt: string;
  }): Promise<number> {
    const prompt = `你是一个AI新闻价值评估专家。请评估以下AI新闻的重要性，给出0-100的评分。

新闻信息：
标题：${newsItem.title}
摘要：${newsItem.summary}
分类：${newsItem.category}
作者：${newsItem.authorName} (@${newsItem.authorHandle})
发布时间：${newsItem.publishedAt}

评分标准（0-100分）：

【高分因素 70-100分】
- 重大产品/模型发布（如GPT-5、Claude 4等）：85-100分
- 突破性技术进展（如新的训练方法、架构创新）：80-95分
- 重要融资/收购（金额>1亿美元）：75-90分
- 影响行业的政策法规：75-90分
- 知名公司重大战略调整：70-85分

【中等分数 40-69分】
- 产品功能更新（非重大版本）：50-70分
- 研究论文发布（非顶会）：45-65分
- 中小规模融资/合作：40-60分
- 开源项目发布（有一定影响力）：45-65分
- 行业观点/分析（来自权威人士）：40-60分

【低分因素 0-39分】
- 小功能更新、bug修复：20-40分
- 个人观点/评论（非权威）：10-30分
- 转发/引用他人内容：10-30分
- 宣传性质内容：5-25分

【加分项】
- 作者影响力（Sam Altman、Yann LeCun等）：+10-20分
- 时效性（24小时内）：+5-10分
- 独家信息/首发：+10-15分

【减分项】
- 信息模糊、缺乏细节：-10-20分
- 纯转发无评论：-10-15分
- 过度营销：-15-25分

请只返回一个0-100之间的整数，不要任何其他文字。`;

    try {
      const responseText = await this.callAPI(prompt);
      const score = parseInt(responseText.trim(), 10);

      if (isNaN(score) || score < 0 || score > 100) {
        console.warn(`Invalid score "${responseText}", defaulting to 50`);
        return 50;
      }

      return score;
    } catch (error) {
      console.error('MiniMax scoreNewsImportance error:', error);
      return 50; // 降级方案：返回中等分数
    }
  }

  /**
   * 生成新闻的语义指纹
   * 提取主题、实体、事件类型等结构化信息
   */
  async generateSemanticFingerprint(newsItem: {
    title: string;
    summary: string;
    authorHandle: string;
  }): Promise<SemanticFingerprint> {
    const prompt = `分析这条 AI 新闻，提取结构化信息：

标题：${newsItem.title}
摘要：${newsItem.summary}
作者：@${newsItem.authorHandle}

请提取：
1. 主题（用 3-5 个词概括核心话题）
2. 关键实体：
   - 人物（@handle 或姓名）
   - 公司/组织
   - 产品/模型名称
   - 技术概念
3. 事件类型：announcement（发布）/ discussion（讨论）/ analysis（分析）/ reaction（反应）

请严格按照以下JSON格式返回（不要包含任何其他文字）：
{
  "mainTopic": "...",
  "entities": {
    "people": [...],
    "companies": [...],
    "products": [...],
    "concepts": [...]
  },
  "eventType": "announcement"
}`;

    try {
      const responseText = await this.callAPI(prompt);
      const cleanedText = responseText.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const fingerprint = JSON.parse(cleanedText) as SemanticFingerprint;

      // 验证返回的数据结构
      if (!fingerprint.mainTopic || !fingerprint.entities || !fingerprint.eventType) {
        throw new Error('Invalid fingerprint structure');
      }

      return fingerprint;
    } catch (error) {
      console.error('MiniMax generateSemanticFingerprint error:', error);
      // 降级方案：返回基础指纹
      return {
        mainTopic: newsItem.title.substring(0, 20),
        entities: {
          people: [],
          companies: [],
          products: [],
          concepts: []
        },
        eventType: 'discussion'
      };
    }
  }

  /**
   * 批量比较多条新闻的语义相似度
   * 返回相似度矩阵
   */
  async compareSimilarityBatch(
    posts: Array<{
      id: string;
      title: string;
      summary: string;
      authorHandle: string;
    }>
  ): Promise<SimilarityResult[]> {
    if (posts.length < 2) {
      return [];
    }

    const postsList = posts.map((p, i) =>
      `[${i}] ID:${p.id} | ${p.title} - ${p.summary} (by @${p.authorHandle})`
    ).join('\n');

    const prompt = `比较以下新闻是否讨论同一事件/话题。如果是同一新闻事件的不同报道/讨论，相似度应该很高。

新闻列表：
${postsList}

对于每对新闻，判断是否属于同一新闻事件，返回相似度 0-100 和原因。

**重要：id1 和 id2 必须使用实际的帖子ID（以 "x_" 或 "ID:" 后面的完整ID），不要使用数组索引号。**

请严格按照以下JSON格式返回（不要包含任何其他文字）：
[
  {"id1": "x_2030326937869242487", "id2": "x_2030319489993298349", "similarity": 85, "reason": "都在讨论 Yann LeCun 发布的世界模型论文"},
  ...
]

只返回相似度 >= 60 的配对。如果没有相似的配对，返回空数组 []。`;

    try {
      const responseText = await this.callAPI(prompt);
      const cleanedText = responseText.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const results = JSON.parse(cleanedText) as SimilarityResult[];

      // 验证返回的数据结构
      if (!Array.isArray(results)) {
        throw new Error('Invalid similarity results structure');
      }

      // 过滤和验证每个结果
      return results.filter(r =>
        r.id1 && r.id2 &&
        typeof r.similarity === 'number' &&
        r.similarity >= 0 && r.similarity <= 100
      );
    } catch (error) {
      console.error('MiniMax compareSimilarityBatch error:', error);
      // 降级方案：返回空数组（不进行语义去重）
      return [];
    }
  }

  /**
   * 分析推文（Phase 2 新增）
   * 提取实体、事件类型、来源类型、新颖度等信息
   */
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
      : '用户常看的信息源：暂无订阅列表；relevance 仍只输出一句「和这类读者的关系」（见字段说明）。';

    const ref =
      referencedPost?.text?.trim() && referencedPost
        ? referencedPost
        : null;
    const refAuthorLine =
      ref && (ref.name || ref.userName)
        ? [ref.name?.trim(), ref.userName ? `@${String(ref.userName).replace(/^@/, '')}` : '']
            .filter(Boolean)
            .join(' ')
        : '（嵌套作者未知）';

    const bodyIntro = ref
      ? `推文结构：存在嵌套推文（${ref.kind === 'retweet' ? '转发' : '引用'}）。

发布者：${authorName} (@${authorHandle})

【主帖】为其直接发出的文字（引用时的评论、转发附言；纯转发时可能为空或极短）：
${text.trim() || '（空）'}

【嵌套推文】为被引用/被转发的原文，作者：${refAuthorLine}
${ref.text}`
      : `推文内容：${text}
作者：${authorName} (@${authorHandle})`;

    const hlDesc =
      '字符串数组，**2～3 条，最多 3 条**。每条单独一句大白话，20-35 字以内为宜，写清一个信息点（事实、数字、动向）；少用术语。**加粗**仅用于该条里最必要的专有名词、产品/模型名、机构名或关键数字；每条**最多 1 处** Markdown 双星号短语；加粗片段不超过 6 个汉字（英文专名可略长）；禁止加粗半句或整句；避免与译文逐句重复';

    const relDesc =
      '**单个字符串**（禁止数组、禁止换行）。**只回答一句：这条帖子和这位用户有什么关系**——结合读者画像与常看订阅源（作者在不在列表、话题是否命中其关注领域、是否值得 Ta 点开看等）；无订阅列表时写与「一般关注 AI 前沿的中文读者」的关系即可。不要复述帖子事实、不要写「变化+启发」两段式，**只保留关系这一句**。35 个汉字以内；全句**最多 1 处** Markdown 加粗（如 @handle 或领域词）。若作者 @' +
      authorHandle +
      ' 在订阅里可自然点出。';

    const translationRules = ref
      ? `2. translatedText: 仅【主帖】的完整简体中文译文；主帖无实质内容时用空字符串 ""
3. translatedTextReferenced: 【嵌套推文】的完整简体中文译文（必填，勿省略句段）。已是中文则略润色
4. highlights: ${hlDesc}
5. relevance: ${relDesc}
6. entities: 实体列表（公司、产品、人物名称，如 ["OpenAI", "GPT-4", "Sam Altman"]）
7. eventType: 事件类型（announcement/discussion/analysis/reaction/other）
8. sourceType: 来源类型（official/media/expert/user）
9. importanceScore: 重要性评分（0-100，考虑影响力、新颖性、价值）
10. noveltyScore: 新颖度评分（0-100，是否是新信息）`
      : `2. translatedText: 必填。将推文全文完整译为简体中文（勿省略句段，勿在字段内保留外文句子）。若原文已是中文，输出与原文一致或略润色后的全文
3. highlights: ${hlDesc}
4. relevance: ${relDesc}
5. entities: 实体列表（公司、产品、人物名称，如 ["OpenAI", "GPT-4", "Sam Altman"]）
6. eventType: 事件类型（announcement/discussion/analysis/reaction/other）
7. sourceType: 来源类型（official/media/expert/user）
8. importanceScore: 重要性评分（0-100，考虑影响力、新颖性、价值）
9. noveltyScore: 新颖度评分（0-100，是否是新信息）`;

    const prompt = `分析以下推文，提取关键信息：

${bodyIntro}

读者画像（中文）：${persona}
${sourcesSection}

请提取以下信息并以JSON格式返回：
1. canonicalSummary: 标准化摘要（简洁描述核心内容，50字以内${ref ? '；综合主帖与嵌套推文的信息价值' : ''}）
${translationRules}

返回格式：
{
  "canonicalSummary": "...",
  "translatedText": "...",
${ref ? '  "translatedTextReferenced": "...",\n' : ''}  "highlights": ["要点一", "要点二", "要点三"],
  "relevance": "**@作者** 在你订阅里，这条讲模型更新，和你常看的方向相关。",
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
      if (
        ref &&
        typeof result.translatedTextReferenced === 'string' &&
        result.translatedTextReferenced.trim() !== ''
      ) {
        translatedTextReferenced = result.translatedTextReferenced.trim();
      }

      let highlights: string[] | undefined;
      if (Array.isArray(result.highlights)) {
        const h = result.highlights
          .filter((x: unknown): x is string => typeof x === 'string')
          .map((s: string) => s.trim())
          .filter(Boolean)
          .slice(0, 3);
        if (h.length > 0) highlights = h;
      }

      let relevance: string | undefined;
      const rawRel = result.relevance;
      if (typeof rawRel === 'string' && rawRel.trim() !== '') {
        relevance = rawRel.trim();
      } else if (Array.isArray(rawRel)) {
        const first = rawRel
          .filter((x: unknown): x is string => typeof x === 'string')
          .map((s: string) => s.trim())
          .filter(Boolean)[0];
        if (first) relevance = first;
      }

      return {
        canonicalSummary: result.canonicalSummary || text.substring(0, 50),
        translatedText,
        translatedTextReferenced,
        highlights,
        relevance,
        entities: Array.isArray(result.entities) ? result.entities : [],
        eventType: result.eventType || 'other',
        sourceType: result.sourceType || 'user',
        importanceScore: typeof result.importanceScore === 'number' ? result.importanceScore : 50,
        noveltyScore: typeof result.noveltyScore === 'number' ? result.noveltyScore : 50
      };
    } catch (error) {
      console.error('MiniMax analyzePost error:', error);
      // 降级方案：返回基本信息
      return {
        canonicalSummary: text.substring(0, 50),
        entities: [],
        eventType: 'other',
        sourceType: 'user',
        importanceScore: 50,
        noveltyScore: 50
      };
    }
  }
}
