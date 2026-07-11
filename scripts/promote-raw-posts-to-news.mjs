/**
 * @deprecated 仅应急用：会绕过 AI 筛选并写入固定 60 分。
 * 正常流程请走 POST /api/refresh/fetch + /api/refresh/process。
 * 若已运行本脚本，请执行: npx tsx scripts/reconcile-bulk-news.ts
 */
import 'dotenv/config'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const STATUS_RE = /(?:x\.com|twitter\.com)\/([^/?#]+)\/status\/(\d{5,})/i

function newsIdFromRawId(rawId) {
  const id = String(rawId).trim()
  if (/^x[-_]/i.test(id)) return id.replace(/^x_/, 'x-')
  if (/^\d{5,}$/.test(id)) return `x-${id}`
  return id
}

async function main() {
  const client = await pool.connect()
  try {
    const { rows } = await client.query('SELECT * FROM raw_posts ORDER BY created_at DESC')
    let inserted = 0
    let skipped = 0

    for (const row of rows) {
      const url = String(row.url || '').trim()
      const m = url.match(STATUS_RE)
      if (!m) {
        skipped++
        continue
      }

      const handle = m[1]
      const statusId = m[2]
      const newsId = newsIdFromRawId(row.id)
      const canonicalUrl = `https://x.com/${handle}/status/${statusId}`
      const content = String(row.content || '').trim()
      const title =
        String(row.title || '').trim() ||
        (content ? content.slice(0, 80) : `@${handle} 的推文`)
      const summary = content ? content.slice(0, 200) : `来自 @${handle} 的 X 推文`
      const publishedAt = row.published_at || row.created_at || new Date().toISOString()
      const originalText = content || summary

      const existing = await client.query('SELECT id FROM news_items WHERE id = $1 OR source_url = $2 LIMIT 1', [
        newsId,
        canonicalUrl,
      ])
      if (existing.rows.length > 0) {
        skipped++
        continue
      }

      const sourceName = handle
      await client.query(
        `INSERT INTO news_items (
          id, title, summary, content, source_platform, source_name, source_handle, source_url,
          category, published_at, original_text, importance_score, created_at
        ) VALUES ($1,$2,$3,$4,'X',$5,$6,$7,$8,$9,$10,$11,NOW())
        ON CONFLICT (id) DO NOTHING`,
        [
          newsId,
          title,
          summary,
          content || summary,
          sourceName,
          handle,
          canonicalUrl,
          '行业',
          publishedAt,
          originalText,
          60,
        ],
      )
      inserted++
    }

    console.log(`Promoted ${inserted} raw_posts → news_items (${skipped} skipped).`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
