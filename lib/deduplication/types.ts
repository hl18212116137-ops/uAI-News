/**
 * 语义指纹类型
 * 用于表示新闻的结构化语义信息
 */
export interface SemanticFingerprint {
  mainTopic: string;              // 主题（如 "Yann LeCun 世界模型"）
  entities: {
    people: string[];             // 提及的人物（如 ["Yann LeCun"]）
    companies: string[];          // 提及的公司（如 ["Meta"]）
    products: string[];           // 提及的产品（如 ["JEPA"]）
    concepts: string[];           // 关键概念（如 ["world model", "reasoning"]）
  };
  eventType: 'announcement' | 'discussion' | 'analysis' | 'reaction';
}

/**
 * 相似度比较结果
 */
export interface SimilarityResult {
  id1: string;
  id2: string;
  similarity: number;             // 0-100
  reason: string;                 // 相似原因说明
}
