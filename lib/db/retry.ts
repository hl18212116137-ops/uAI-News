const TRANSIENT_DATABASE_ERROR_CODES = new Set([
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '08P01',
  '53300',
  '57P01',
  '57P02',
  '57P03',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETRESET',
  'ENETUNREACH',
  'EPIPE',
  'ETIMEDOUT',
])

const TRANSIENT_DATABASE_MESSAGE_PATTERNS = [
  /connection terminated unexpectedly/i,
  /connection terminated/i,
  /connection reset by peer/i,
  /connection refused/i,
  /database system is starting up/i,
  /server closed the connection unexpectedly/i,
  /timeout expired/i,
]

type ErrorLike = {
  code?: unknown
  message?: unknown
  cause?: unknown
}

function errorChain(error: unknown): ErrorLike[] {
  const chain: ErrorLike[] = []
  const seen = new Set<unknown>()
  let current: unknown = error

  while (current && typeof current === 'object' && !seen.has(current) && chain.length < 6) {
    seen.add(current)
    const item = current as ErrorLike
    chain.push(item)
    current = item.cause
  }

  return chain
}

export function isTransientDatabaseError(error: unknown): boolean {
  return errorChain(error).some((item) => {
    const code = typeof item.code === 'string' ? item.code.toUpperCase() : ''
    if (TRANSIENT_DATABASE_ERROR_CODES.has(code)) return true

    const message = typeof item.message === 'string' ? item.message : ''
    return TRANSIENT_DATABASE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
  })
}

export function describeDatabaseError(error: unknown): string {
  const parts = errorChain(error)
    .map((item) => {
      const code = typeof item.code === 'string' ? item.code : ''
      const message = typeof item.message === 'string' ? item.message : ''
      return [code, message].filter(Boolean).join(' ')
    })
    .filter(Boolean)

  return parts.length > 0 ? parts.join(' <- ') : String(error)
}

type DatabaseReadRetryOptions = {
  operationName: string
  retryDelayMs?: number
}

/**
 * 只用于可安全重复执行的数据库读取。连接类瞬时错误仅重试一次；
 * SQL、字段、约束等确定性错误会立即抛出。
 */
export async function withTransientDatabaseReadRetry<T>(
  operation: () => Promise<T>,
  options: DatabaseReadRetryOptions
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!isTransientDatabaseError(error)) throw error

    const retryDelayMs = options.retryDelayMs ?? 150
    console.warn(
      `[db] ${options.operationName} 遇到瞬时连接错误，${retryDelayMs}ms 后重试一次：${describeDatabaseError(error)}`
    )
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    return operation()
  }
}
