import { z } from 'zod'
import { cleanEnvValue } from '@/lib/env'

export const AI_PROVIDERS = ['deepseek', 'minimax', 'claude'] as const
export type AIProvider = typeof AI_PROVIDERS[number]
export const AI_PROVIDER_OPTIONS = {
  deepseek: { label: 'DeepSeek', model: 'deepseek-chat', endpoints: ['https://api.deepseek.com/chat/completions'] },
  minimax: { label: 'MiniMax', model: 'MiniMax-M2.7', endpoints: ['https://api.minimax.cn/v1/chat/completions', 'https://api.minimax.io/v1/chat/completions', 'https://api.minimax.chat/v1/text/chatcompletion_v2'] },
  claude: { label: 'Claude', model: 'claude-sonnet-4-6', endpoints: ['https://api.anthropic.com/v1/messages'] },
} as const

export type AIConnection = { provider: AIProvider; model: string; endpoint: string; apiKey: string; timeoutSeconds: number; groupId?: string; deadlineAt?: number }
export type SavedAISettings = { provider: AIProvider; fallbackProvider: AIProvider | null; timeoutSeconds: number; connections: Partial<Record<AIProvider, Pick<AIConnection, 'model' | 'endpoint'> & { apiKey?: string }>> }
export type PublicAISettings = {
  provider: AIProvider; fallbackProvider: AIProvider | null; timeoutSeconds: number; source: 'env' | 'db'
  connections: Record<AIProvider, { model: string; endpoint: string; configured: boolean; keySource: 'env' | 'db' | 'missing' }>
}

export const aiSettingsInputSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  fallbackProvider: z.enum(AI_PROVIDERS).nullable(),
  model: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._:/-]+$/),
  endpoint: z.string(),
  apiKey: z.string().trim().min(1).max(4096).optional(),
  clearApiKey: z.boolean().optional(),
  timeoutSeconds: z.number().int().min(10).max(60),
}).strict().superRefine((input, ctx) => {
  if (!(AI_PROVIDER_OPTIONS[input.provider].endpoints as readonly string[]).includes(input.endpoint)) {
    ctx.addIssue({ code: 'custom', path: ['endpoint'], message: '请选择对应服务商的官方接口' })
  }
  if (input.provider === input.fallbackProvider) ctx.addIssue({ code: 'custom', path: ['fallbackProvider'], message: '备用服务不能与主服务相同' })
  if (input.apiKey && input.clearApiKey) ctx.addIssue({ code: 'custom', path: ['apiKey'], message: '不能同时替换和清除 Key' })
})
export type AISettingsInput = z.infer<typeof aiSettingsInputSchema>

export function environmentAIConnection(provider: AIProvider): AIConnection {
  const prefix = provider === 'claude' ? 'ANTHROPIC' : provider.toUpperCase()
  const model = cleanEnvValue(process.env[`${prefix}_MODEL`]) || AI_PROVIDER_OPTIONS[provider].model
  const legacyMinimax = provider === 'minimax' && model.startsWith('abab')
  const endpoint = legacyMinimax ? AI_PROVIDER_OPTIONS.minimax.endpoints[2] : AI_PROVIDER_OPTIONS[provider].endpoints[0]
  return { provider, model, endpoint, apiKey: cleanEnvValue(process.env[`${prefix}_API_KEY`]), timeoutSeconds: 30,
    ...(provider === 'minimax' ? { groupId: cleanEnvValue(process.env.MINIMAX_GROUP_ID) } : {}) }
}

export function resolveAISettings(saved: SavedAISettings | null) {
  const envProvider = cleanEnvValue(process.env.AI_PROVIDER)
  const provider = saved?.provider ?? (AI_PROVIDERS.includes(envProvider as AIProvider) ? envProvider as AIProvider : 'deepseek')
  const fallbackProvider = saved ? saved.fallbackProvider : provider === 'deepseek' ? 'minimax' : 'deepseek'
  const connections = Object.fromEntries(AI_PROVIDERS.map((name) => [name, {
    ...environmentAIConnection(name), ...saved?.connections[name], timeoutSeconds: saved?.timeoutSeconds ?? 30,
  }])) as Record<AIProvider, AIConnection>
  return { provider, fallbackProvider, connections, timeoutSeconds: saved?.timeoutSeconds ?? 30 }
}

export function publicAISettings(saved: SavedAISettings | null): PublicAISettings {
  const resolved = resolveAISettings(saved)
  return { provider: resolved.provider, fallbackProvider: resolved.fallbackProvider, timeoutSeconds: resolved.timeoutSeconds,
    source: saved ? 'db' : 'env', connections: Object.fromEntries(AI_PROVIDERS.map((name) => {
      const { model, endpoint, apiKey } = resolved.connections[name]
      return [name, { model, endpoint, configured: Boolean(apiKey), keySource: !apiKey ? 'missing' : saved?.connections[name]?.apiKey !== undefined ? 'db' : 'env' }]
    })) as PublicAISettings['connections'] }
}

export function mergeAISettings(saved: SavedAISettings | null, input: AISettingsInput): SavedAISettings {
  const previous = saved?.connections[input.provider]
  return { provider: input.provider, fallbackProvider: input.fallbackProvider, timeoutSeconds: input.timeoutSeconds,
    connections: { ...saved?.connections, [input.provider]: { ...previous, model: input.model, endpoint: input.endpoint,
      ...(input.clearApiKey ? { apiKey: '' } : input.apiKey ? { apiKey: input.apiKey } : {}) } } }
}
