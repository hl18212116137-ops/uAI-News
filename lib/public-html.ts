import { lookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'

const blockedV4 = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const) blockedV4.addSubnet(address, prefix)
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')
const blockedV6 = new BlockList()
blockedV6.addSubnet('2001::', 23, 'ipv6')
blockedV6.addSubnet('2001:db8::', 32, 'ipv6')
blockedV6.addSubnet('2002::', 16, 'ipv6')
blockedV6.addSubnet('3fff::', 20, 'ipv6')

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return !blockedV4.check(address)
  return family === 6 && globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6')
}

export async function resolvePublicHtmlTarget(raw: string, signal?: AbortSignal) {
  const url = new URL(raw)
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error('仅支持使用标准端口的公开网页')
  }
  const family = isIP(hostname)
  signal?.throwIfAborted()
  let onAbort: (() => void) | undefined
  const addresses = family ? [{ address: hostname, family }] : await Promise.race([
    lookup(hostname, { all: true }),
    new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal?.reason ?? new Error('网页请求超时'))
      signal?.addEventListener('abort', onAbort, { once: true })
    }),
  ]).finally(() => { if (onAbort) signal?.removeEventListener('abort', onAbort) })
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('不支持内网或本机网页地址')
  }
  // Pin this connection to the address already checked; do not resolve DNS again.
  const selected = addresses[0]
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    callback(null, options.all ? [selected] : selected.address, selected.family)
  }
  return { url, pinnedLookup }
}

/** Public article HTML only: bounded body, deadline, and validation on every redirect. */
export async function fetchPublicHtml(raw: string, userAgent: string): Promise<{ html: string; resolvedUrl: string } | null> {
  const signal = AbortSignal.timeout(12_000)
  let current = raw
  for (let redirects = 0; redirects <= 5; redirects++) {
    const { url, pinnedLookup } = await resolvePublicHtmlTarget(current, signal)
    signal.throwIfAborted()
    const result = await new Promise<{ html: string } | { redirect: string } | null>((resolve, reject) => {
      const transport = url.protocol === 'https:' ? https : http
      const request = transport.get(url, {
        lookup: pinnedLookup, signal, agent: false,
        headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml', 'accept-encoding': 'identity' },
      }, (response) => {
        response.on('error', reject)
        const status = response.statusCode ?? 0
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          try { resolve({ redirect: new URL(response.headers.location, url).href }) }
          catch (error) { reject(error) }
          response.destroy()
          return
        }
        const type = response.headers['content-type'] ?? ''
        if (status < 200 || status >= 300 || !/text\/html|application\/xhtml/i.test(type)) {
          resolve(null)
          response.destroy()
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        response.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > 4 * 1024 * 1024) {
            response.destroy(new Error('文章网页超过 4MB 限制'))
          } else chunks.push(chunk)
        })
        response.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }))
      })
      request.on('error', reject)
    })
    if (!result) return null
    if ('html' in result) return { html: result.html, resolvedUrl: url.href }
    current = result.redirect
  }
  throw new Error('文章网页跳转次数过多')
}
