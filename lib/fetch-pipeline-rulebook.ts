import 'server-only'

import type { RulebookStage } from '@/lib/fetch-pipeline-public-config.types'

export const PIPELINE_CODE_REFS = [
  'lib/services/ingest-service.ts',
  'lib/db/raw-posts.ts',
  'lib/raw-post-quality.ts',
  'lib/services/process-service.ts',
  'lib/feed-window.ts',
  'lib/x.ts',
] as const

/**
 * 面向设置面板的规则说明：尽量用用户能直接判断的说法，不暴露内部表名和变量名。
 */
export function getFetchPipelineRulebook(): RulebookStage[] {
  return [
    {
      key: 'sources',
      title: '信息源与订阅',
      steps: [
        {
          id: 'src-1',
          condition: '某个信息源不在你的订阅里',
          action: '刷新时不会抓它。',
          platform: 'all',
        },
        {
          id: 'src-2',
          condition: '某个信息源被暂停抓取',
          action: '刷新时会跳过它。',
          platform: 'all',
        },
        {
          id: 'src-3',
          condition: '信息源既已订阅，也没有暂停',
          action: '刷新时会抓取它的新内容。',
          platform: 'all',
        },
      ],
    },
    {
      key: 'dedupe',
      title: '拉取与去重',
      steps: [
        {
          id: 'ded-1',
          condition: '同一条内容以前已经抓过',
          action: '这次直接跳过，不再重复处理。',
          platform: 'all',
        },
        {
          id: 'ded-2',
          condition: '同一个链接已经出现在资讯里',
          action: '这次直接跳过，避免首页出现两条一样的内容。',
          platform: 'x',
        },
        {
          id: 'ded-3',
          condition: '同一轮刷新里前面已经收过',
          action: '后面再遇到就跳过。',
          platform: 'x',
        },
        {
          id: 'ded-4',
          condition: '网页或 RSS 内容的链接和旧资讯一样',
          action: '开启这条规则时会跳过它。',
          platform: 'x',
        },
        {
          id: 'ded-5',
          condition: '没有命中任何重复规则',
          action: '才会进入下一步处理。',
          platform: 'rss_blog',
        },
      ],
    },
    {
      key: 'raw',
      title: '进入待处理区',
      steps: [
        {
          id: 'raw-1',
          condition: '内容通过了信息源和去重检查',
          action: '先放到待处理区，等后面继续筛。',
          platform: 'all',
        },
        {
          id: 'raw-2',
          condition: '后台处理开关打开',
          action: '内容会排队处理，避免一次刷新卡太久。',
          platform: 'all',
        },
      ],
    },
    {
      key: 'quality',
      title: '低信号预筛（进入 AI 之前）',
      steps: [
        {
          id: 'q-1',
          condition: '正文太短，而且没有图片或视频',
          action: '直接丢弃，不再交给 AI 判断。',
          platform: 'all',
        },
        {
          id: 'q-2',
          condition: '只是转发或引用，补充内容太短，也没有图片或视频',
          action: '直接丢弃。',
          platform: 'all',
        },
        {
          id: 'q-3',
          condition: '内容虽然短，但带了图片或视频',
          action: '保留下来继续判断。',
          platform: 'all',
        },
        {
          id: 'q-4',
          condition: '没有命中低信号规则',
          action: '进入 AI 判断。',
          platform: 'all',
        },
      ],
    },
    {
      key: 'ai',
      title: 'AI 判断是否值得入库',
      steps: [
        {
          id: 'ai-1',
          condition: '内容和 AI 新闻关系不大',
          action: '不放进资讯流。',
          platform: 'all',
        },
        {
          id: 'ai-2',
          condition: '内容有新闻价值',
          action: '生成标题、摘要和分类。',
          platform: 'all',
        },
        {
          id: 'ai-3',
          condition: '内容通过 AI 判断',
          action: '进入资讯流，并参与后续排序。',
          platform: 'all',
        },
      ],
    },
    {
      key: 'feed',
      title: '首页列表过滤',
      steps: [
        {
          id: 'fd-1',
          condition: '内容太旧',
          action: '首页不显示。',
          platform: 'all',
        },
        {
          id: 'fd-2',
          condition: '重要性分数太低',
          action: '首页不显示，但内容仍保留在库里。',
          platform: 'all',
        },
      ],
    },
  ]
}
