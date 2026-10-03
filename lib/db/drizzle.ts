import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import { describeDatabaseError } from './retry'

// Reuse the connection pool across Next.js development module reloads.
const runtime = globalThis as typeof globalThis & { uaiDatabasePool?: Pool }
const pool = runtime.uaiDatabasePool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  maxLifetimeSeconds: 300,
  statement_timeout: 15_000,
})
if (!runtime.uaiDatabasePool) {
  pool.on('error', (error) => console.error('[db] Idle connection failed:', describeDatabaseError(error)))
  runtime.uaiDatabasePool = pool
}
export const db = drizzle(pool, { schema })
export { pool }
