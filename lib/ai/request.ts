import type { AIConnection } from './config'

export class AIRequestError extends Error {
  constructor(message: string, public status?: number) { super(message); this.name = 'AIRequestError' }
}

export function isPermanentAIError(error: unknown): boolean {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
  return typeof status === 'number' && [400, 401, 402, 403, 404, 408, 422].includes(status)
}

function statusMessage(provider: string, status: number) {
  if (status === 401 || status === 403) return `${provider} API Key 无效或没有权限（${status}）`
  if (status === 402) return `${provider} 接口余额不足（402）`
  if (status === 400 || status === 404 || status === 422) return `${provider} 模型或接口参数不正确（${status}）`
  if (status === 429) return `${provider} 请求过于频繁（429）`
  return `${provider} 接口请求失败（${status}）`
}

export async function requestAIText(connection: AIConnection, prompt: string, systemPrompt?: string): Promise<string> {
  const { provider, apiKey, model, endpoint, timeoutSeconds } = connection
  if (!apiKey) throw new AIRequestError(`${provider} API Key 未配置`, 401)
  const remaining = connection.deadlineAt == null ? Infinity : connection.deadlineAt - Date.now()
  if (remaining <= 0) throw new AIRequestError('本条推文的 AI 处理已超时，将保留原文供下次重试', 408)
  const messages = [...(systemPrompt && provider !== 'claude' ? [{ role: 'system', content: systemPrompt }] : []), { role: 'user', content: prompt }]
  try {
    const response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutSeconds * 1000, remaining))),
      headers: { 'Content-Type': 'application/json', ...(provider === 'claude'
        ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } : { Authorization: `Bearer ${apiKey}` }) },
      body: JSON.stringify({ model, messages, max_tokens: 4096, temperature: provider === 'minimax' && !model.startsWith('abab') ? 1 : 0.3,
        ...(provider === 'claude' && systemPrompt ? { system: systemPrompt } : {}),
        ...(provider === 'minimax' && connection.groupId && endpoint.includes('minimax.chat') ? { group_id: connection.groupId } : {}) }),
    })
    if (!response.ok) { await response.body?.cancel(); throw new AIRequestError(statusMessage(provider, response.status), response.status) }
    const data = await response.json()
    if (data.base_resp?.status_code) {
      const code = data.base_resp.status_code
      throw new AIRequestError(`${provider} 接口拒绝请求（业务码 ${code}），请检查 Key、余额和模型`, 400)
    }
    const text = provider === 'claude' ? data.content?.filter((block: { type: string }) => block.type === 'text').map((block: { text: string }) => block.text).join('\n') : data.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text.trim()) throw new AIRequestError(`${provider} 没有返回文本，请检查模型与输出限制`, 422)
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  } catch (error) {
    if (error instanceof AIRequestError) throw error
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new AIRequestError(`${provider} 请求超过 ${timeoutSeconds} 秒，已停止等待`)
    throw new AIRequestError(`${provider} 网络请求失败，请检查接口连接`)
  }
}
