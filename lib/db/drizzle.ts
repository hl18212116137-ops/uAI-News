import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import { describeDatabaseError } from './retry'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  maxLifetimeSeconds: 300,
})

pool.on('error', (error) => {
  console.error(`[db] PostgreSQL 空闲连接异常：${describeDatabaseError(error)}`)
})

export const db = drizzle(pool, { schema })

export { pool }
