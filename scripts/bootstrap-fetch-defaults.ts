/**
 * 为默认订阅源触发 X 抓取 + AI 中文处理（开发/运维用）
 * 用法: npx tsx scripts/bootstrap-fetch-defaults.ts [handle1 handle2 ...]
 */
import './server-only-stub.cjs'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

import { scheduleStaleSourceFetches } from '../lib/feed-stale-fetch'

const handles =
  process.argv.length > 2
    ? process.argv.slice(2)
    : ['karpathy', 'sama', 'ylecun']

if (!process.env.TWITTERAPI_IO_KEY?.trim()) {
  console.error('TWITTERAPI_IO_KEY 未配置，无法抓取。请在 .env.local 填入后重试。')
  process.exit(1)
}

console.log('触发后台抓取:', handles.join(', '))
scheduleStaleSourceFetches(handles)

// 等待任务完成（简单轮询 taskManager 不可用跨进程，故固定等待）
console.log('抓取已在 dev 进程内调度；若 dev 未运行，请登录站点后点「抓取更新」。')
setTimeout(() => process.exit(0), 3000)
