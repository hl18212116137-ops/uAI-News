import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import dns from 'node:dns/promises'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { fetchPublicHtml, isPublicAddress, resolvePublicHtmlTarget } from '../lib/public-html'

test('article fetch rejects internal, encoded, mapped, and reserved addresses before connecting', async () => {
  for (const address of ['127.0.0.1', '10.2.3.4', '172.16.0.1', '192.168.1.2', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2002:7f00:1::', '2001:db8::1']) {
    assert.equal(isPublicAddress(address), false, address)
  }
  for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) assert.equal(isPublicAddress(address), true)
  for (const url of ['http://127.1/', 'http://0x7f000001/', 'http://2130706433/', 'http://[::ffff:127.0.0.1]/', 'file:///etc/passwd', 'https://user:password@example.invalid/', 'http://1.1.1.1:5432/']) {
    await assert.rejects(resolvePublicHtmlTarget(url), undefined, url)
  }
})

test('article fetch pins validated DNS and rejects domains with any internal address', async (t) => {
  const resolver = t.mock.method(dns, 'lookup', async () => [{ address: '1.1.1.1', family: 4 }])
  const target = await resolvePublicHtmlTarget('https://example.invalid/article')
  resolver.mock.mockImplementation(async () => [{ address: '127.0.0.1', family: 4 }])
  target.pinnedLookup('example.invalid', { all: true }, (error, addresses) => {
    assert.equal(error, null)
    assert.deepEqual(addresses, [{ address: '1.1.1.1', family: 4 }])
  })
  await assert.rejects(resolvePublicHtmlTarget('https://example.invalid/article'), /内网/)
  resolver.mock.mockImplementation(async () => [{ address: '1.1.1.1', family: 4 }, { address: '10.0.0.1', family: 4 }])
  await assert.rejects(resolvePublicHtmlTarget('https://example.invalid/article'), /内网/)
})

test('article fetch rechecks redirects and caps streamed HTML', async (t) => {
  let status = 302
  let location = 'http://127.0.0.1/private'
  let body = '<html>article</html>'
  let calls = 0
  t.mock.method(http, 'get', (_url, _options, callback) => {
    calls++
    const request = new EventEmitter()
    queueMicrotask(() => {
      const response = Object.assign(new PassThrough(), { statusCode: status, headers: { 'content-type': 'text/html', location } })
      callback(response)
      if (!response.destroyed) response.end(body)
    })
    return request
  })
  await assert.rejects(fetchPublicHtml('http://1.1.1.1/article', 'test'), /内网/)
  assert.equal(calls, 1, 'the redirect must be blocked before a second request')
  location = 'http://['
  await assert.rejects(fetchPublicHtml('http://1.1.1.1/article', 'test'))
  status = 200
  assert.deepEqual(await fetchPublicHtml('http://1.1.1.1/article', 'test'), { html: body, resolvedUrl: 'http://1.1.1.1/article' })
  body = 'x'.repeat(4 * 1024 * 1024 + 1)
  await assert.rejects(fetchPublicHtml('http://1.1.1.1/article', 'test'), /4MB/)
})
