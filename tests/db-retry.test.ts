import test from 'node:test'
import assert from 'node:assert/strict'
import {
  describeDatabaseError,
  isTransientDatabaseError,
  withTransientDatabaseReadRetry,
} from '../lib/db/retry'

test('识别嵌套的 PostgreSQL 瞬时连接错误', () => {
  const error = Object.assign(new Error('Failed query: select 1'), {
    cause: Object.assign(new Error('Connection terminated unexpectedly'), {
      code: 'ECONNRESET',
    }),
  })

  assert.equal(isTransientDatabaseError(error), true)
  assert.match(describeDatabaseError(error), /ECONNRESET/)
})

test('不把 SQL 结构错误识别为瞬时错误', () => {
  const error = Object.assign(new Error('column does_not_exist does not exist'), {
    code: '42703',
  })

  assert.equal(isTransientDatabaseError(error), false)
})

test('瞬时读取错误只重试一次并返回第二次结果', async () => {
  let attempts = 0
  const result = await withTransientDatabaseReadRetry(
    async () => {
      attempts += 1
      if (attempts === 1) {
        throw Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
      }
      return 'ok'
    },
    { operationName: 'test read', retryDelayMs: 0 }
  )

  assert.equal(result, 'ok')
  assert.equal(attempts, 2)
})

test('确定性错误不会重试', async () => {
  let attempts = 0

  await assert.rejects(
    withTransientDatabaseReadRetry(
      async () => {
        attempts += 1
        throw Object.assign(new Error('syntax error'), { code: '42601' })
      },
      { operationName: 'test read', retryDelayMs: 0 }
    ),
    /syntax error/
  )
  assert.equal(attempts, 1)
})
