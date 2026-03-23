import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { fetchUserInfoFromX } from '../lib/x'

// 直接创建 Supabase 客户端，避免导入 server-only 模块
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
  )
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

/**
 * 批量更新所有 X 平台信息源的头像和简介
 * 只更新 avatar 或 description 为空的信息源
 */
async function updateSourceAvatars() {
  console.log('开始批量更新信息源头像...\n')

  // 查询所有 X 平台的信息源
  const { data: sources, error } = await supabase
    .from('sources')
    .select('*')
    .eq('platform', 'X')
    .or('avatar.is.null,description.is.null')  // 只更新缺失字段的

  if (error) {
    console.error('查询信息源失败:', error)
    return
  }

  if (!sources || sources.length === 0) {
    console.log('没有需要更新的信息源')
    return
  }

  console.log(`找到 ${sources.length} 个需要更新的信息源\n`)

  let successCount = 0
  let failCount = 0

  for (const source of sources) {
    try {
      console.log(`正在更新 @${source.handle}...`)

      // 从 X API 获取用户信息
      const userInfo = await fetchUserInfoFromX(source.handle)

      // 只更新缺失的字段
      const updates: any = {}
      if (!source.avatar && userInfo.avatar) {
        updates.avatar = userInfo.avatar
      }
      if (!source.description && userInfo.description) {
        updates.description = userInfo.description
      }

      if (Object.keys(updates).length === 0) {
        console.log(`  ✓ @${source.handle} 无需更新\n`)
        continue
      }

      // 更新数据库
      const { error: updateError } = await supabase
        .from('sources')
        .update(updates)
        .eq('id', source.id)

      if (updateError) {
        console.error(`  ✗ 更新失败:`, updateError.message)
        failCount++
      } else {
        console.log(`  ✓ 更新成功:`)
        if (updates.avatar) console.log(`    - 头像: ${updates.avatar.substring(0, 50)}...`)
        if (updates.description) console.log(`    - 简介: ${updates.description}`)
        successCount++
      }

      console.log('')

      // 避免 API 限流，每次请求间隔 1 秒
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (error: any) {
      console.error(`  ✗ 获取用户信息失败:`, error.message)
      failCount++
      console.log('')
    }
  }

  console.log('\n批量更新完成!')
  console.log(`成功: ${successCount} 个`)
  console.log(`失败: ${failCount} 个`)
}

updateSourceAvatars()
