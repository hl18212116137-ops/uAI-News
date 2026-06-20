import * as nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd(), true)

async function main() {
  const { backfillSourceProfilesLocal } = await import('../lib/enrich-source-profiles')
  console.log('开始本地回填全库信息源头像与简介（不调用 X API）…\n')
  const result = await backfillSourceProfilesLocal()
  console.log(`回填完成：更新 ${result.updated} 条`)
}

main().catch((err) => {
  console.error('backfill-source-profiles failed:', err)
  process.exit(1)
})
