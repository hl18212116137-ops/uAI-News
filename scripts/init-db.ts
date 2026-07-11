import { config as loadEnv } from 'dotenv'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { Pool } from 'pg'

async function main() {
  const localEnvPath = join(process.cwd(), '.env.local')
  if (existsSync(localEnvPath)) {
    loadEnv({ path: localEnvPath })
  } else {
    loadEnv()
  }

  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: url })
  const sqlPath = join(__dirname, '..', 'db', 'init.sql')
  const sql = readFileSync(sqlPath, 'utf-8')

  console.log('Connecting to database...')
  const client = await pool.connect()
  try {
    console.log('Running init.sql...')
    await client.query(sql)
    console.log('Database initialized successfully.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('init-db failed:', err)
  process.exit(1)
})
