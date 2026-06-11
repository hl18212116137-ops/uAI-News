import 'dotenv/config'
import { enrichSourcesMissingProfile } from '../lib/enrich-source-profiles'

async function updateSourceAvatars() {
  console.log('开始批量更新信息源头像与简介（X 平台，缺 avatar 或 description）...\n')
  const result = await enrichSourcesMissingProfile({ delayMs: 1000 })
  console.log('\n批量更新完成:', result)
}

updateSourceAvatars().catch((e) => {
  console.error(e)
  process.exit(1)
})
