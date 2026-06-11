import 'server-only'

/**
 * 首页服务端分段耗时：开发环境默认打日志；生产可设 PERF_HOME_SERVER_LOG=1。
 * 与 middleware 的 Server-Timing（仅含鉴权段）对照使用。
 */
export function createHomePerf(label: string) {
  const t0 = performance.now()
  let last = t0
  const segments: { name: string; durMs: number }[] = []

  return {
    segment(name: string) {
      const now = performance.now()
      segments.push({ name, durMs: now - last })
      last = now
    },
    logTotal() {
      const enabled =
        process.env.PERF_HOME_SERVER_LOG === '1' || process.env.NODE_ENV === 'development'
      if (!enabled) return
      const total = performance.now() - t0
      const parts = segments.map((s) => `${s.name}=${s.durMs.toFixed(1)}ms`).join(' ')
      console.info(`[home-perf:${label}] total=${total.toFixed(1)}ms ${parts}`)
    },
  }
}
