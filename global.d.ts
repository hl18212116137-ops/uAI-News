/** 项目级全局类型补充（见 tsconfig include）。 */

export {}

declare global {
  interface Window {
    twttr?: {
      widgets: {
        load: (element?: Element | null) => void
      }
    }
  }
}
