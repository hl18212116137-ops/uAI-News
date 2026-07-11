import 'server-only'

import type { AuthUser } from '@/lib/auth'
type User = AuthUser
import type {
  FetchPipelinePublicConfig,
  FetchPipelineStageDescription,
} from '@/lib/fetch-pipeline-public-config.types'
import { getFetchPipelineRulebook, PIPELINE_CODE_REFS } from '@/lib/fetch-pipeline-rulebook'
import { isPipelineAdmin } from '@/lib/pipeline-admin'
import { getEffectivePipelineSettingsSnapshot } from '@/lib/pipeline-settings'
import { isProcessingJobsPipelineEnabled } from '@/lib/processing-jobs-pipeline'

export type { FetchPipelinePublicConfig, FetchPipelineStageDescription }

function buildStages(): FetchPipelineStageDescription[] {
  return [
    {
      key: 'sources',
      title: '信息源与订阅',
      detail:
        '刷新时只抓取 sources 表中已启用、且（登录下）位于您订阅列表中的账号；RSS/Blog 走对应订阅地址。',
    },
    {
      key: 'fetch',
      title: '拉取与去重',
      detail:
        'X：id 与 post_url 与已有 raw / news 去重。RSS/Blog：默认仅 id；可开启与 news.source_url 的 URL 去重。',
    },
    {
      key: 'raw',
      title: '写入待处理队列',
      detail: '新内容写入 raw_posts，随后进入 AI 处理阶段（可与 processing_jobs 队列配合）。',
    },
    {
      key: 'quality',
      title: '低信号预筛',
      detail:
        '极短外层正文或极短引用正文且无媒体时丢弃；阈值见生效参数（站点配置或环境变量）。',
    },
    {
      key: 'ai',
      title: 'AI 结构化与筛选',
      detail:
        '模型生成标题、摘要、分类，并判定是否与 AI 资讯相关；硬新闻之外，高价值观点/线索也可进入资讯流。',
    },
    {
      key: 'feed',
      title: '首页时间窗',
      detail: '列表默认只展示近若干天内发布的条目（与 FEED_VISIBLE_DAYS 一致）。',
    },
  ]
}

/**
 * 登录用户可见的完整流水线快照：规则书、生效来源、是否可编辑（管理员）。
 */
export async function getFetchPipelinePublicConfigPayload(
  user: Pick<User, 'id' | 'email'> | null
): Promise<FetchPipelinePublicConfig> {
  const effectiveSettings = await getEffectivePipelineSettingsSnapshot()

  return {
    feedVisibleDays: effectiveSettings.feedVisibleDays.value,
    rawMinOuterChars: effectiveSettings.rawMinOuterChars.value,
    rawMinNestedCharsRetweet: effectiveSettings.rawMinNestedCharsRetweet.value,
    fetchMaxPostsPerHandlePerRun: effectiveSettings.fetchMaxPostsPerHandlePerRun.value,
    xFetchConfigured: Boolean(process.env.TWITTERAPI_IO_KEY?.trim()),
    processingJobsEnabled: isProcessingJobsPipelineEnabled(),
    stages: buildStages(),
    aiRulesSummary: [
      '分类维度包括：模型更新、产品动态、研究、公司、融资、政策、开源、观点线索等。',
      '「重要 / 不重要」由模型结合内容与账号语境判断；不重要条目会删除 raw，不写入 news_items。',
      '重要性分数在入库后单独计算，用于排序与展示权重。',
    ],
    effectiveSettings,
    rulebook: getFetchPipelineRulebook(),
    codeRefs: [...PIPELINE_CODE_REFS],
    canEdit: isPipelineAdmin(user),
  }
}
