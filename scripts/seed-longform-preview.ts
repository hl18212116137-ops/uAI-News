import { config as loadEnv } from 'dotenv'
import { existsSync } from 'fs'
import { join } from 'path'
import { Pool } from 'pg'

type PreviewArticle = {
  id: string
  title: string
  summary: string
  content: string
  sourceName: string
  sourceHandle: string
  category: string
  publishedHoursAgo: number
  originalUrl: string
  article: {
    url: string
    resolvedUrl: string
    title: string
    translatedTitle: string
    sourceName: string
    authorName: string
    excerpt: string
    translatedContent: string
    originalWordCount: number
  }
}

function loadLocalEnv() {
  for (const name of ['.env.local', '.env.development.local']) {
    const file = join(process.cwd(), name)
    if (existsSync(file)) {
      loadEnv({ path: file, override: false })
    }
  }
  loadEnv({ override: false })
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function joinParagraphs(paragraphs: string[]): string {
  return paragraphs.join('\n\n')
}

const ARTICLES: PreviewArticle[] = [
  {
    id: 'x-uai-longform-preview',
    title: '智能体产品如何改变 AI 工作流：一篇值得深读的长文',
    summary: '示例长文：从任务分配、工具权限到结果验收，展示智能体产品如何重塑知识工作。',
    content: '这条示例推文模拟发现了一篇博客长文，系统会保留推文本身，同时把原文译文放入优质长文模块。',
    sourceName: 'Andrej Karpathy',
    sourceHandle: 'karpathy',
    category: '产品',
    publishedHoursAgo: 0.5,
    originalUrl: 'https://x.com/karpathy/status/uai-longform-preview',
    article: {
      url: 'https://example.com/ai-agentic-products',
      resolvedUrl: 'https://example.com/ai-agentic-products',
      title: 'How agentic products change AI workflows',
      translatedTitle: '智能体产品如何改变 AI 工作流',
      sourceName: 'AI Engineering Notes',
      authorName: 'Andrej Karpathy',
      excerpt: '当 AI 产品从“回答问题”转向“完成任务”，真正变化的不是界面按钮，而是人如何拆解工作、授权工具、检查结果。',
      translatedContent: joinParagraphs([
        '过去的 AI 产品大多像一个更聪明的输入框：用户提出问题，模型返回答案，工作仍然停留在人手里。智能体产品真正改变的地方，是它开始接管任务链条中的中间步骤。',
        '一个好的智能体不应该只会生成文本。它需要理解目标、拆分子任务、选择工具、保留过程证据，并在关键节点把控制权交还给人。产品设计的重点，也从“让模型说得好”转向“让系统做得稳”。',
        '这会改变团队的协作方式。过去，一个需求会被拆成产品、设计、工程、运营之间的传递；现在，一部分探索、整理、验证、草拟可以由智能体先跑完，人再把注意力放在判断和取舍上。',
        '但智能体越主动，产品越需要边界。权限、回滚、审计、可解释的中间产物，会比炫酷的聊天动效更重要。用户不只是想让 AI 快一点，更想知道它为什么这样做，以及哪里可以打断。',
        '未来的工作流不会只有一个万能助手，而会是一组能被调度的小型智能体。它们像一套临时组装的工作台：有的搜集信息，有的写代码，有的做校对，有的检查风险。产品的胜负手，是让这套工作台足够可靠、足够安静。',
      ]),
      originalWordCount: 4200,
    },
  },
  {
    id: 'x-uai-longform-preview-product-ui',
    title: 'AI 产品界面正在从按钮变成协作者',
    summary: '示例长文：讨论 AI 应用为什么不能只堆按钮，而要围绕上下文、意图和验收构建界面。',
    content: '一篇关于 AI 产品界面的长文被推文引用，系统抓取后进入优质长文模块。',
    sourceName: 'Paul Graham',
    sourceHandle: 'paulg',
    category: '产品',
    publishedHoursAgo: 0.8,
    originalUrl: 'https://x.com/paulg/status/uai-longform-preview-product-ui',
    article: {
      url: 'https://example.com/ai-product-interfaces',
      resolvedUrl: 'https://example.com/ai-product-interfaces',
      title: 'AI interfaces are becoming collaborators',
      translatedTitle: 'AI 产品界面正在从按钮变成协作者',
      sourceName: 'Product Systems Review',
      authorName: 'Sarah Chen',
      excerpt: 'AI 应用的界面不该只是更多输入框和更多按钮。真正有效的界面，会持续表达上下文、状态、信心和下一步。',
      translatedContent: joinParagraphs([
        '传统软件界面假设用户知道自己要做什么，只需要找到正确按钮。AI 产品恰好相反：用户经常只有模糊目标，需要系统帮助他们把目标变成可执行路径。',
        '因此，AI 界面的核心不是把所有能力铺出来，而是把正在发生的事情讲清楚。系统读到了什么、准备做什么、卡在哪里、需要用户批准什么，这些状态比功能菜单更重要。',
        '优秀的 AI 产品会像一个协作者，而不是一个表单。它会保留上下文，记住偏好，主动提出下一步，但不会假装自己永远正确。它需要让用户随时能审阅、修改、回退。',
        '很多失败的 AI 界面把复杂性转嫁给用户：按钮越来越多，模式越来越多，用户反而不知道该从哪里开始。真正成熟的设计会把复杂性收进系统内部，只暴露少量高信号选择。',
        '未来的界面会更像工作记录。它不仅展示最终答案，也展示关键证据、被放弃的路径和需要人工判断的节点。这样 AI 才能从“工具”变成可协作的工作伙伴。',
      ]),
      originalWordCount: 3600,
    },
  },
  {
    id: 'x-uai-longform-preview-world-models',
    title: '世界模型仍是智能体落地的关键瓶颈',
    summary: '示例长文：解释为什么仅靠语言推理还不够，智能体需要更稳定的环境模型和反馈循环。',
    content: '这条示例推文链接到一篇研究向长文，用于预览研究类文章在优质长文模块里的阅读效果。',
    sourceName: 'Yann LeCun',
    sourceHandle: 'ylecun',
    category: '研究',
    publishedHoursAgo: 1.1,
    originalUrl: 'https://x.com/ylecun/status/uai-longform-preview-world-models',
    article: {
      url: 'https://example.com/world-models-agent-bottleneck',
      resolvedUrl: 'https://example.com/world-models-agent-bottleneck',
      title: 'World models remain the bottleneck for useful agents',
      translatedTitle: '世界模型仍是智能体落地的关键瓶颈',
      sourceName: 'Research Fieldnotes',
      authorName: 'Maya Raman',
      excerpt: '智能体要长期可靠地行动，不能只依赖下一句预测。它需要知道环境如何变化、行动会带来什么后果。',
      translatedContent: joinParagraphs([
        '今天很多智能体看起来像在推理，其实更像在不断修补上下文。它们能把步骤写得漂亮，却经常不知道某个操作会怎样改变外部世界。',
        '这就是世界模型的问题。一个系统如果要在真实环境中连续行动，就必须对环境状态、因果关系、时间延迟和失败模式有稳定表示。语言模型可以描述这些东西，但描述不等于拥有可验证的内部模型。',
        '在软件任务里，这个问题会表现为反复试错：智能体执行命令、读错误、修改、再执行。短任务里这很有用，长任务里却会逐渐积累偏差，因为它没有清晰维护“现在世界是什么样”。',
        '更好的路径可能是把语言模型、可执行环境、状态追踪器和评估器拆开。语言模型负责规划和解释，环境模型负责预测影响，评估器负责检查偏差。单一模型不必承担全部职责。',
        '这不是否定智能体，而是提醒我们：让智能体可靠落地，需要把“会说”推进到“会保持状态、会预测后果、会承认不确定”。这一步会决定很多产品能否从演示走向生产。',
      ]),
      originalWordCount: 5100,
    },
  },
  {
    id: 'x-uai-longform-preview-startup-os',
    title: '小团队正在用 AI 重写公司的操作系统',
    summary: '示例长文：观察创业公司如何把 AI 嵌入招聘、销售、客服、研发和管理节奏。',
    content: '一篇创业公司运营长文被推文引用，系统将其译文收录到优质长文。',
    sourceName: 'Paul Graham',
    sourceHandle: 'paulg',
    category: '行业',
    publishedHoursAgo: 1.4,
    originalUrl: 'https://x.com/paulg/status/uai-longform-preview-startup-os',
    article: {
      url: 'https://example.com/ai-startup-operating-system',
      resolvedUrl: 'https://example.com/ai-startup-operating-system',
      title: 'Small teams are rewriting the company operating system with AI',
      translatedTitle: '小团队正在用 AI 重写公司的操作系统',
      sourceName: 'Founder Essays',
      authorName: 'Paul Graham',
      excerpt: 'AI 对创业公司的影响不只是少招几个人，而是让公司流程从“部门传递”变成“任务编排”。',
      translatedContent: joinParagraphs([
        '小团队最先感受到 AI 的变化，因为它们没有复杂流程要保护。一个五人团队可以在一周内把销售线索整理、竞品监控、客服草稿和产品文档全部接进 AI 工作流。',
        '这并不意味着公司会变成无人组织。相反，人的判断变得更集中：创始人需要定义什么值得做，什么不能交给系统，什么结果必须人工验收。',
        '过去，公司操作系统由会议、表格、工单和层级组成。AI 进入后，很多中间传递会被压缩。任务不再只是从 A 交给 B，而是被拆成一组可执行、可检查、可回滚的小步骤。',
        '这会奖励那些能清楚表达标准的团队。模糊的公司无法从 AI 中获得太多杠杆，因为模型不知道什么叫“好”。清晰的公司则会把自己的判断标准变成可复用流程。',
        '真正的变化不是“AI 替代员工”，而是公司开始围绕智能体重新布置工作。谁提出问题，谁设定边界，谁验收结果，这些角色会比传统职能分工更重要。',
      ]),
      originalWordCount: 3900,
    },
  },
  {
    id: 'x-uai-longform-preview-post-training',
    title: '开源模型进入后训练时代',
    summary: '示例长文：梳理开源模型竞争从预训练规模转向数据配方、偏好优化和工具使用。',
    content: '这条示例推文链接到一篇模型生态分析文章，展示更偏技术的长文排版效果。',
    sourceName: 'Andrej Karpathy',
    sourceHandle: 'karpathy',
    category: '模型',
    publishedHoursAgo: 1.7,
    originalUrl: 'https://x.com/karpathy/status/uai-longform-preview-post-training',
    article: {
      url: 'https://example.com/open-models-post-training-era',
      resolvedUrl: 'https://example.com/open-models-post-training-era',
      title: 'Open models enter the post-training era',
      translatedTitle: '开源模型进入后训练时代',
      sourceName: 'Model Notes',
      authorName: 'Nora Klein',
      excerpt: '开源模型的差距正在从参数规模转向后训练系统：数据选择、偏好优化、工具使用和评测闭环。',
      translatedContent: joinParagraphs([
        '过去两年，开源模型的叙事主要围绕预训练规模：多少参数、多少 token、多少 GPU。现在，真正的竞争越来越多发生在后训练阶段。',
        '后训练不是一个单独步骤，而是一套系统。它包括指令数据筛选、偏好优化、拒答边界、工具调用、长上下文稳定性和领域评测。一个中等规模模型，如果后训练做得好，常常能在真实任务里超过更大的裸模型。',
        '这对开源社区尤其重要。预训练成本很高，但后训练更容易被分工协作。不同团队可以贡献高质量任务集、评测集、工具调用轨迹和偏好数据，形成更快的迭代循环。',
        '风险也在这里。后训练数据如果只追求排行榜，会把模型推向过拟合的演示能力。真正有价值的后训练，应该围绕用户任务构建闭环：失败样本回收、人工审查、线上评测和持续回归测试。',
        '开源模型的下一阶段，胜负不会只看谁训练了最大底座，而是谁能把模型接入一套可靠的改进系统。后训练正在从技巧变成基础设施。',
      ]),
      originalWordCount: 4700,
    },
  },
]

async function main() {
  loadLocalEnv()
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const item of ARTICLES) {
      const longformJson = {
        ...item.article,
        fetchedAt: new Date().toISOString(),
      }

      await client.query(
        `INSERT INTO news_items (
          id,
          title,
          summary,
          content,
          source_platform,
          source_name,
          source_handle,
          source_url,
          category,
          published_at,
          original_text,
          created_at,
          importance_score,
          longform_json
        )
        VALUES ($1, $2, $3, $4, 'X', $5, $6, $7, $8, $9, $10, $9, $11, $12::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          content = EXCLUDED.content,
          source_platform = EXCLUDED.source_platform,
          source_name = EXCLUDED.source_name,
          source_handle = EXCLUDED.source_handle,
          source_url = EXCLUDED.source_url,
          category = EXCLUDED.category,
          published_at = EXCLUDED.published_at,
          original_text = EXCLUDED.original_text,
          created_at = EXCLUDED.created_at,
          importance_score = EXCLUDED.importance_score,
          longform_json = EXCLUDED.longform_json`,
        [
          item.id,
          item.title,
          item.summary,
          item.content,
          item.sourceName,
          item.sourceHandle,
          item.originalUrl,
          item.category,
          hoursAgo(item.publishedHoursAgo),
          `${item.content}\n\n${item.article.url}`,
          96,
          JSON.stringify(longformJson),
        ],
      )
    }
    await client.query('COMMIT')
    console.log(`Seeded ${ARTICLES.length} premium longform preview articles.`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error('seed-longform-preview failed:', error)
  process.exit(1)
})
