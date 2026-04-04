import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { enrichSourcesMissingProfile } from '../lib/enrich-source-profiles'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
  )
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function updateSourceAvatars() {
  console.log('开始批量更新信息源头像与简介（X 平台，缺 avatar 或 description）...\n')
  const result = await enrichSourcesMissingProfile(supabase, { delayMs: 1000 })
  console.log('\n批量更新完成:', result)
}

updateSourceAvatars().catch((e) => {
  console.error(e)
  process.exit(1)
})
