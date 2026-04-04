import 'server-only'

/** 与 S2 表 `processing_jobs` 配合；未迁移或未开开关时保持旧路径 */
export function isProcessingJobsPipelineEnabled(): boolean {
  return process.env.PROCESSING_JOBS_ENABLED === 'true'
}
