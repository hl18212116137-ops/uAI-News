/** 与 `getFetchPipelinePublicConfigPayload()` 返回结构一致，供客户端类型引用（无 server-only） */

export type FetchPipelineStageDescription = {
  key: string
  title: string
  detail: string
}

export type SettingValueSource = 'db' | 'env' | 'default'

export type SourcedNumber = { value: number; source: SettingValueSource }
export type SourcedBoolean = { value: boolean; source: SettingValueSource }
export type SourcedNullableNumber = { value: number | null; source: SettingValueSource }

export type PipelineEffectiveSettingsSnapshot = {
  rawMinOuterChars: SourcedNumber
  rawMinNestedCharsRetweet: SourcedNumber
  ingestDedupeRssBlogMatchNewsUrl: SourcedBoolean
  feedVisibleDays: SourcedNumber
  feedMinImportanceScore: SourcedNumber
  fetchMaxPostsPerHandlePerRun: SourcedNullableNumber
}

export type RulebookStep = {
  id: string
  condition: string
  action: string
  platform?: 'x' | 'rss_blog' | 'all'
}

export type RulebookStage = {
  key: string
  title: string
  steps: RulebookStep[]
  notes?: string[]
}

/** 登录用户 GET /api/me/fetch-pipeline-config 的完整正文 */
export type FetchPipelinePublicConfig = {
  feedVisibleDays: number
  rawMinOuterChars: number
  rawMinNestedCharsRetweet: number
  fetchMaxPostsPerHandlePerRun: number | null
  xFetchConfigured: boolean
  processingJobsEnabled: boolean
  stages: FetchPipelineStageDescription[]
  aiRulesSummary: string[]
  effectiveSettings: PipelineEffectiveSettingsSnapshot
  rulebook: RulebookStage[]
  codeRefs: string[]
  canEdit: boolean
}
