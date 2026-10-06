import 'server-only'
import { pool } from '@/lib/db/drizzle'
import { decryptAISettings, encryptAISettings } from './credentials'
import { mergeAISettings, type AISettingsInput, type SavedAISettings } from './config'

function secret() { return process.env.AI_SETTINGS_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || '' }

export async function readAISettings(): Promise<SavedAISettings | null> {
  try {
    const result = await pool.query<{ encrypted: string }>('SELECT encrypted FROM site_ai_settings WHERE id = $1', ['default'])
    return result.rows[0] ? decryptAISettings<SavedAISettings>(result.rows[0].encrypted, secret()) : null
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '42P01') return null
    throw new Error('AI 配置无法读取，请检查数据库与加密密钥')
  }
}

export async function saveAISettings(input: AISettingsInput): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT pg_advisory_xact_lock(hashtext('uai:ai-settings'))")
    const result = await client.query<{ encrypted: string }>('SELECT encrypted FROM site_ai_settings WHERE id = $1', ['default'])
    const saved = result.rows[0] ? decryptAISettings<SavedAISettings>(result.rows[0].encrypted, secret()) : null
    const encrypted = encryptAISettings(mergeAISettings(saved, input), secret())
    await client.query('INSERT INTO site_ai_settings (id, encrypted) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET encrypted = EXCLUDED.encrypted, updated_at = now()', ['default', encrypted])
    await client.query('COMMIT')
  } catch {
    await client.query('ROLLBACK')
    throw new Error('AI 配置保存失败，请检查配置存储是否已初始化及加密密钥')
  } finally { client.release() }
}

export async function resetAISettings() {
  try { await pool.query('DELETE FROM site_ai_settings WHERE id = $1', ['default']) }
  catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === '42P01')) throw error
  }
}
