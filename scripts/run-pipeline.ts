import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
  const mode = process.argv[2]
  if (!['fetch', 'process'].includes(mode) || process.argv.includes('--help')) {
    console.log('Usage: npm run fetch | npm run process — uses configured database and API keys')
    return
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  const { pool } = await import('../lib/db/drizzle')
  try {
    const result = mode === 'fetch'
      ? await (await import('../lib/services/ingest-service')).runRefreshFetchFromEnabledSources({})
      : await (await import('../lib/services/process-service')).runRefreshProcessRawQueue()
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await pool.end()
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Pipeline failed')
  process.exitCode = 1
})
