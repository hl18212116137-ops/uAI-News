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

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email?: string | null
      name?: string | null
    }
  }

  interface User {
    id: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
  }
}
