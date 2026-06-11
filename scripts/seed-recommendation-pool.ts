import 'dotenv/config'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Pool } from 'pg'
import { RECOMMENDATION_POOL } from '../lib/recommendation-pool-data'
import { resolveSourceProfile } from '../lib/source-profile'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

async function ensureSchema(client: import('pg').PoolClient) {
  const migrationPath = join(__dirname, '..', 'db', 'migrations', 'add-recommendation-pool.sql')
  const sql = readFileSync(migrationPath, 'utf-8')
  await client.query(sql)
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  const client = await pool.connect()

  try {
    await ensureSchema(client)
    await client.query('BEGIN')

    await client.query(`UPDATE sources SET in_recommendation_pool = false WHERE in_recommendation_pool = true`)

    const poolHandles = RECOMMENDATION_POOL.map((r) => r.handle.toLowerCase())
    let inserted = 0
    let updated = 0

    for (const entry of RECOMMENDATION_POOL) {
      const url = `https://x.com/${entry.handle}`
      const profile = resolveSourceProfile({
        handle: entry.handle,
        platform: 'X',
        description: entry.description,
      })

      const existing = await client.query<{ id: string }>(
        `SELECT id FROM sources
         WHERE platform = 'X' AND lower(handle) = lower($1)
         LIMIT 1`,
        [entry.handle]
      )

      if (existing.rows[0]) {
        await client.query(
          `UPDATE sources SET
             in_recommendation_pool = true,
             name = $2,
             description = $3,
             avatar = $4,
             source_type = $5,
             url = $6
           WHERE id = $1`,
          [
            existing.rows[0].id,
            entry.name,
            profile.description,
            profile.avatar,
            entry.sourceType,
            url,
          ]
        )
        updated++
      } else {
        await client.query(
          `INSERT INTO sources (
             source_type, platform, handle, name, url, avatar, description, enabled, in_recommendation_pool
           ) VALUES ($1, 'X', $2, $3, $4, $5, $6, false, true)`,
          [entry.sourceType, entry.handle, entry.name, url, profile.avatar, profile.description]
        )
        inserted++
      }
    }

    const countRes = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM sources WHERE in_recommendation_pool = true`
    )
    const poolCount = parseInt(countRes.rows[0]?.n ?? '0', 10)

    const allRows = await client.query<{
      id: string
      handle: string
      platform: string | null
      avatar: string | null
      description: string | null
    }>(`SELECT id, handle, platform, avatar, description FROM sources`)

    let profileBackfilled = 0
    for (const row of allRows.rows) {
      const profile = resolveSourceProfile({
        handle: row.handle,
        platform: row.platform ?? 'X',
        avatar: row.avatar,
        description: row.description,
      })
      const avatarChanged = String(row.avatar ?? '').trim() !== profile.avatar
      const descChanged = String(row.description ?? '').trim() !== profile.description
      if (!avatarChanged && !descChanged) continue

      await client.query(`UPDATE sources SET avatar = $1, description = $2 WHERE id = $3`, [
        profile.avatar,
        profile.description,
        row.id,
      ])
      profileBackfilled++
    }

    await client.query('COMMIT')

    console.log(
      `推荐池种子完成：新增 ${inserted}，更新 ${updated}，池中共 ${poolCount} 条（目标 ${RECOMMENDATION_POOL.length}），全库资料回填 ${profileBackfilled} 条`
    )

    const stray = await client.query<{ handle: string }>(
      `SELECT handle FROM sources
       WHERE in_recommendation_pool = true
         AND lower(handle) NOT IN (SELECT unnest($1::text[]))`,
      [poolHandles]
    )
    if (stray.rows.length > 0) {
      console.warn('警告：池中存在不在种子列表的 handle：', stray.rows.map((r) => r.handle).join(', '))
    }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('seed-recommendation-pool failed:', err)
  process.exit(1)
})
