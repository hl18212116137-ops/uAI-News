import { NewsCategory } from './types';

// MiniMax API 配置
const MINIMAX_API_URL = 'https://api.minimax.chat/v1/text/chatcompletion_v2';

// AI 处理结果类型
export type AIProcessedContent = {
  title: string;
  summary: string;
  category: NewsCategory;
};

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
 * 调用 MiniMax API
 */
async function callMinimaxAPI(prompt: string): Promise<string> {
  // 动态读取环境变量
  const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
  const MINIMAX_GROUP_ID = process.env.MINIMAX_GROUP_ID || '';
  const MINIMAX_MODEL = process.env.MINIMAX_MODEL || 'abab6.5-chat';

  if (!MINIMAX_API_KEY) {
    throw new Error('MINIMAX_API_KEY is not configured');
  }

  const response = await fetch(MINIMAX_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MINIMAX_API_KEY}`,
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 2048,
      ...(MINIMAX_GROUP_ID && { group_id: MINIMAX_GROUP_ID }),
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
 * 使用 AI 处理新闻：生成中文标题、摘要和分类
 */
export async function processNewsWithAI(
  text: string,
  authorName: string,
  authorHandle: string
): Promise<AIProcessedContent> {
  const prompt = `你是一个AI新闻分析专家。请分析以下英文推文，生成中文标题、中文摘要和分类。

推文内容：
${text}

作者：${authorName} (@${authorHandle})

请严格按照以下JSON格式返回（不要包含任何其他文字）：

{
  "title": "中文标题（15-30字，简洁有力，突出核心信息）",
  "summary": "中文摘要（50-100字，包含：1）发生了什么 2）为什么重要）",
  "category": "分类（必须是以下之一）"
}

分类规则（category必须精确匹配）：
- "Model Update" - 模型更新、新模型发布、模型能力提升
- "Product Update" - 产品功能更新、新产品发布
- "Research" - 研究论文、实验结果、技术突破
- "Company News" - 公司动态、合作伙伴关系、收购
- "Funding" - 融资、投资消息
- "Policy" - 政策法规、监管动态
- "Open Source" - 开源项目、代码发布
- "Other" - 其他类型

要求：
1. 标题要吸引人，体现新闻价值
2. 摘要要准确传达原文核心信息
3. 分类要准确，基于内容理解
4. 使用简体中文
5. 保持专业、客观的语气`;

  try {
    const responseText = await callMinimaxAPI(prompt);

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
      title: parsed.title || '未命名新闻',
      summary: parsed.summary || '暂无摘要',
      category: parsed.category,
    };
  } catch (error) {
    console.error('AI processing error:', error);
    throw error;
  }
}

/**
 * 翻译内容为中文
 */
export async function translateContent(content: string): Promise<string> {
  const prompt = `请将以下英文内容翻译成简体中文。要求：
1. 准确传达原文意思
2. 保持专业、流畅的中文表达
3. 保留技术术语的准确性
4. 只返回翻译结果，不要任何额外说明

原文：
${content}`;

  try {
    const translatedText = await callMinimaxAPI(prompt);
    return translatedText.trim();
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}
