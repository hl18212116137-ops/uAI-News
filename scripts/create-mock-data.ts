import 'dotenv/config'
import { Pool } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const pool = new Pool({ connectionString: DATABASE_URL })

const SOURCES = [
  {
    source_type: 'blogger', platform: 'X', handle: 'karpathy',
    name: 'Andrej Karpathy', url: 'https://x.com/karpathy',
    description: '前Tesla AI总监，OpenAI创始成员',
    avatar: 'https://pbs.twimg.com/profile_images/1296667294148382721/9Pr6XrPB_normal.jpg',
  },
  {
    source_type: 'blogger', platform: 'X', handle: 'sama',
    name: 'Sam Altman', url: 'https://x.com/sama',
    description: 'OpenAI CEO',
    avatar: null,
  },
  {
    source_type: 'blogger', platform: 'X', handle: 'ylecun',
    name: 'Yann LeCun', url: 'https://x.com/ylecun',
    description: 'Meta首席AI科学家，图灵奖得主',
    avatar: null,
  },
  {
    source_type: 'blogger', platform: 'X', handle: 'elonmusk',
    name: 'Elon Musk', url: 'https://x.com/elonmusk',
    description: 'Tesla/SpaceX/xAI 创始人',
    avatar: null,
  },
  {
    source_type: 'blogger', platform: 'X', handle: 'DarioAmodei',
    name: 'Dario Amodei', url: 'https://x.com/DarioAmodei',
    description: 'Anthropic CEO，AI领域专家',
    avatar: null,
  },
  {
    source_type: 'blogger', platform: 'X', handle: 'ilyasut',
    name: 'Ilya Sutskever', url: 'https://x.com/ilyasut',
    description: 'OpenAI联合创始人，AI研究专家',
    avatar: null,
  },
  {
    source_type: 'media', platform: 'X', handle: 'OpenAI',
    name: 'OpenAI', url: 'https://x.com/OpenAI',
    description: 'OpenAI官方账号',
    avatar: null,
  },
  {
    source_type: 'media', platform: 'X', handle: 'AnthropicAI',
    name: 'Anthropic', url: 'https://x.com/AnthropicAI',
    description: 'Anthropic官方账号',
    avatar: null,
  },
  {
    source_type: 'media', platform: 'X', handle: 'GoogleDeepMind',
    name: 'Google DeepMind', url: 'https://x.com/GoogleDeepMind',
    description: 'Google DeepMind官方账号',
    avatar: null,
  },
  {
    source_type: 'media', platform: 'X', handle: 'huggingface',
    name: 'Hugging Face', url: 'https://x.com/huggingface',
    description: 'Hugging Face官方账号',
    avatar: null,
  },
]

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

const NEWS_ITEMS = [
  {
    id: 'seed-karpathy-1',
    title: 'LLM 推理优化：如何在不损失精度的情况下实现 3x 推理加速',
    summary: '详细分析了通过量化、投机解码和 KV 缓存优化实现大模型推理加速的最新技术路线。',
    content: '深入解析了大语言模型推理优化的三种主流方案：INT4 量化、投机解码（speculative decoding）与 KV 缓存压缩。实验数据表明，结合这三种技术可实现 3.2 倍推理提速且精度损失低于 0.5%。',
    source_platform: 'X', source_name: 'Andrej Karpathy', source_handle: 'karpathy',
    source_url: 'https://x.com/karpathy/status/seed1',
    category: '研究',
    published_at: hoursAgo(2), original_text: 'Thread on LLM inference optimization: We benchmarked INT4 quantization + speculative decoding + KV cache compression across 7 model families. Combined, you get 3.2x speedup with <0.5% accuracy loss. The trick is matching the draft model capacity to the target — too small and speculation acceptance rate drops below 60%, too large and you lose the latency benefit. KV cache compression via grouped-query attention + sliding window gives another 1.4x on top. Full numbers in the thread below.',
    importance_score: 88,
  },
  {
    id: 'seed-sama-1',
    title: 'GPT-5 系列模型发布计划与安全评估时间表',
    summary: 'OpenAI 公布了下一代模型的发布路线图以及多阶段安全评估计划。',
    content: 'Sam Altman 透露 GPT-5 将采用分阶段发布策略，首先面向安全研究合作伙伴开放评估，随后逐步向开发者和公众开放。模型在推理能力和多模态理解方面有显著提升。',
    source_platform: 'X', source_name: 'Sam Altman', source_handle: 'sama',
    source_url: 'https://x.com/sama/status/seed1',
    category: '行业',
    published_at: hoursAgo(4), original_text: 'Sharing some updates on our model release timeline. We are taking a staged approach with GPT-5: first opening to safety research partners for red-teaming and evaluation, then gradually expanding to developers and the public. The model shows significant improvements in reasoning, multimodal understanding, and instruction following. We believe responsible deployment means giving the safety community time to assess capabilities before broad release.',
    importance_score: 95,
  },
  {
    id: 'seed-ylecun-1',
    title: '自监督学习在推理任务上展现出令人意外的泛化能力',
    summary: 'JEPA 框架的最新实验显示，自监督目标在未见过的推理基准上具有显著的零样本泛化能力。',
    content: '通过在多个推理基准上的对照实验，LeCun 团队发现 JEPA 风格的自监督目标在小规模推理测试中无需特定微调即可获得良好表现，挑战了当前对特定任务微调的必要性认知。',
    source_platform: 'X', source_name: 'Yann LeCun', source_handle: 'ylecun',
    source_url: 'https://x.com/ylecun/status/seed1',
    category: '研究',
    published_at: hoursAgo(6), original_text: 'Surprising result from our controlled sweep: JEPA-style self-supervised objectives hold up remarkably well on held-out reasoning benchmarks — without any task-specific finetuning. We tested across 12 reasoning evals of varying difficulty. The model trained only with self-supervised targets matched or exceeded supervised baselines on 8 of 12. This challenges the prevailing assumption that reasoning requires explicit supervised training.',
    importance_score: 82,
  },
  {
    id: 'seed-openai-1',
    title: 'ChatGPT 新增实时搜索与文献引用功能',
    summary: 'ChatGPT 现已支持实时网页搜索并自动添加引用来源，提高回答可信度。',
    content: 'OpenAI 宣布 ChatGPT 正式集成实时搜索功能，用户的问答现在会自动附带可验证的来源链接。该功能已面向所有 Plus 和 Team 用户开放。',
    source_platform: 'X', source_name: 'OpenAI', source_handle: 'OpenAI',
    source_url: 'https://x.com/OpenAI/status/seed1',
    category: '产品',
    published_at: hoursAgo(8), original_text: 'ChatGPT now includes real-time search with inline citations. When you ask a question, the model automatically searches the web and provides verifiable source links alongside its response. This is rolling out to all Plus and Team users today. Enterprise and Edu coming next week. Each claim that relies on an external source gets a numbered reference you can click to verify.',
    importance_score: 90,
  },
  {
    id: 'seed-anthropic-1',
    title: 'Claude 新版本在编程和数学推理上取得重大突破',
    summary: 'Anthropic 发布 Claude 最新版本，在 SWE-bench 和数学竞赛基准上创下新纪录。',
    content: 'Anthropic 公布了 Claude 的最新能力升级，在 SWE-bench（软件工程能力基准）和多项数学推理评测中均大幅领先。新版本还加强了对长上下文的处理能力，支持高达 200K token 的输入。',
    source_platform: 'X', source_name: 'Anthropic', source_handle: 'AnthropicAI',
    source_url: 'https://x.com/AnthropicAI/status/seed1',
    category: '模型',
    published_at: hoursAgo(10), original_text: 'Claude sets new state-of-the-art on SWE-bench (72.1% resolved) and 4 major math reasoning benchmarks. Key improvements: extended context handling up to 200K tokens with maintained accuracy, significantly better code generation and debugging, and improved multi-step mathematical reasoning. We are also releasing a technical report detailing the training methodology and safety evaluations.',
    importance_score: 92,
  },
  {
    id: 'seed-deepmind-1',
    title: 'AlphaFold 3 开源更新：支持小分子与蛋白质复合体预测',
    summary: 'Google DeepMind 开源了 AlphaFold 3 的核心模块，支持蛋白质-小分子相互作用预测。',
    content: 'Google DeepMind 宣布开源 AlphaFold 3 的推理代码，新版本不仅提升了蛋白质结构预测精度，还扩展了对小分子药物与蛋白质复合体的预测能力，对药物发现有重大推动作用。',
    source_platform: 'X', source_name: 'Google DeepMind', source_handle: 'GoogleDeepMind',
    source_url: 'https://x.com/GoogleDeepMind/status/seed1',
    category: '产品',
    published_at: hoursAgo(12), original_text: 'AlphaFold 3 inference code is now open source. The new version extends beyond protein structure prediction to model protein-small molecule interactions, protein-DNA/RNA complexes, and post-translational modifications. We believe open-sourcing the inference pipeline will accelerate drug discovery and biological research. Model weights and training code to follow.',
    importance_score: 85,
  },
  {
    id: 'seed-hf-1',
    title: 'Hugging Face 推出新一代开源模型排行榜 Open LLM Leaderboard v3',
    summary: '新排行榜引入更严格的评测标准和多维度评分体系，更好地反映模型实际能力。',
    content: 'Hugging Face 发布了 Open LLM Leaderboard 第三版，新增了指令遵循、多轮对话和工具使用等维度的评测，并引入了人工评审校准机制，让排行结果更贴近真实使用场景。',
    source_platform: 'X', source_name: 'Hugging Face', source_handle: 'huggingface',
    source_url: 'https://x.com/huggingface/status/seed1',
    category: '产品',
    published_at: hoursAgo(14), original_text: 'Introducing Open LLM Leaderboard v3. Major changes: new evaluation dimensions including instruction following, multi-turn dialogue, and tool use; human calibration mechanism to align automated scores with real-world usage; contamination detection to flag potentially memorized benchmarks. We evaluated 847 models.',
    importance_score: 78,
  },
  {
    id: 'seed-dario-1',
    title: 'AI 安全研究路线：从对齐到可解释性的实践经验',
    summary: 'Dario Amodei 分享了 Anthropic 在 AI 安全领域的阶段性总结和未来研究方向。',
    content: '在最新的博客文章中，Dario Amodei 回顾了 Anthropic 过去一年在 AI 对齐和可解释性方面的主要进展，包括 Constitutional AI 的改进和神经网络内部表征分析的新方法。',
    source_platform: 'X', source_name: 'Dario Amodei', source_handle: 'DarioAmodei',
    source_url: 'https://x.com/DarioAmodei/status/seed1',
    category: '研究',
    published_at: hoursAgo(16), original_text: 'Reflections on our AI safety research roadmap. Over the past year at Anthropic we have made progress on three fronts: Constitutional AI improvements that reduce harmful outputs by 4x while maintaining helpfulness, mechanistic interpretability breakthroughs that let us identify specific circuits responsible for deceptive behavior, and scalable oversight techniques for models that exceed human capability in narrow domains.',
    importance_score: 80,
  },
  {
    id: 'seed-elonmusk-1',
    title: 'xAI Grok 3 即将发布，将支持多模态与实时信息检索',
    summary: 'Elon Musk 透露 xAI 下一代 Grok 模型的关键功能更新。',
    content: 'Musk 宣布 Grok 3 将具备视觉理解能力和实时信息检索功能，并将与 X 平台深度集成。新模型在内部测试中已展现出与顶级闭源模型相当的性能。',
    source_platform: 'X', source_name: 'Elon Musk', source_handle: 'elonmusk',
    source_url: 'https://x.com/elonmusk/status/seed1',
    category: '行业',
    published_at: hoursAgo(18), original_text: 'Grok 3 is coming soon with multimodal capabilities and real-time information retrieval deeply integrated with X. The model demonstrates competitive performance with top closed-source models on standard benchmarks. Vision understanding, real-time web search, and native X platform integration are the key differentiators. Beta access starting next month.',
    importance_score: 86,
  },
  {
    id: 'seed-ilya-1',
    title: '关于 AI 超级智能安全性的核心挑战与解决思路',
    summary: 'Ilya Sutskever 探讨了实现安全超级智能的技术挑战和可能的研究路径。',
    content: 'Sutskever 发表了关于超级智能安全性的深度思考，指出当前对齐技术在模型能力大幅提升后可能失效，并提出了基于形式化验证和可证明安全性的新研究方向。',
    source_platform: 'X', source_name: 'Ilya Sutskever', source_handle: 'ilyasut',
    source_url: 'https://x.com/ilyasut/status/seed1',
    category: '研究',
    published_at: hoursAgo(20), original_text: 'Thoughts on the core challenges of safe superintelligence. Current alignment techniques may not scale to models significantly more capable than humans. We need provably safe approaches — formal verification of alignment properties, mathematical guarantees on behavior bounds, and interpretability that scales with capability. The alignment tax must decrease, not increase, with scale.',
    importance_score: 84,
  },
]

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    console.log('Seeding sources...')
    for (const s of SOURCES) {
      await client.query(
        `INSERT INTO sources (source_type, platform, handle, name, url, description, avatar, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         ON CONFLICT DO NOTHING`,
        [s.source_type, s.platform, s.handle, s.name, s.url, s.description, s.avatar]
      )
    }

    console.log('Seeding news_items...')
    for (const n of NEWS_ITEMS) {
      await client.query(
        `INSERT INTO news_items (id, title, summary, content, source_platform, source_name, source_handle, source_url, category, published_at, original_text, importance_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING`,
        [n.id, n.title, n.summary, n.content, n.source_platform, n.source_name, n.source_handle, n.source_url, n.category, n.published_at, n.original_text, n.importance_score]
      )
    }

    await client.query('COMMIT')
    console.log(`Seeded ${SOURCES.length} sources and ${NEWS_ITEMS.length} news items.`)

    const srcCount = await client.query('SELECT count(*) FROM sources')
    const newsCount = await client.query('SELECT count(*) FROM news_items')
    console.log(`Total in DB: ${srcCount.rows[0].count} sources, ${newsCount.rows[0].count} news items.`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('create-mock-data failed:', err)
  process.exit(1)
})
