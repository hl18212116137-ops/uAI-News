import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function encryptionKey(secret: string) {
  if (secret.length < 32) throw new Error('AI 配置加密密钥未配置或长度不足')
  return createHash('sha256').update(secret).digest()
}

export function encryptAISettings(value: unknown, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv)
  cipher.setAAD(Buffer.from('uai:ai-settings:v1'))
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.')
}

export function decryptAISettings<T>(value: string, secret: string): T {
  const [version, iv, tag, body] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('AI 配置格式无效')
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(iv, 'base64'))
  cipher.setAAD(Buffer.from('uai:ai-settings:v1'))
  cipher.setAuthTag(Buffer.from(tag, 'base64'))
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(body, 'base64')), cipher.final()]).toString('utf8')) as T
}
