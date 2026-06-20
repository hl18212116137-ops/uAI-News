import * as nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd(), true)

async function updateSourceAvatars() {
  const { enrichSourcesMissingProfile } = await import('../lib/enrich-source-profiles')
  const handles = process.argv.slice(2).map((h) => h.trim()).filter(Boolean)
  const delayMsRaw = process.env.FETCH_USER_INFO_DELAY_MS
  const delayMs = delayMsRaw ? Math.max(0, parseInt(delayMsRaw, 10) || 0) : 1000

  console.log(
    handles.length
      ? `开始更新指定信息源头像与简介：${handles.join(', ')}\n`
      : '开始批量更新信息源头像与简介（X 平台，缺真实 avatar 或缺 description）...\n'
  )

  const result = await enrichSourcesMissingProfile({
    handles: handles.length ? handles : undefined,
    delayMs,
  })
  console.log('\n批量更新完成:', result)
}

updateSourceAvatars().catch((e) => {
  console.error(e)
  process.exit(1)
})
