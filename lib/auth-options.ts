import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/drizzle'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const authSecret = process.env.NEXTAUTH_SECRET

if (!authSecret && process.env.NODE_ENV !== 'production') {
  console.warn(
    '[auth] 未设置 NEXTAUTH_SECRET，登录 JWT 无法签发。请在 .env.local 中配置 NEXTAUTH_SECRET。'
  )
}

export const authOptions: NextAuthOptions = {
  secret: authSecret,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        if (!authSecret) {
          throw new Error('CONFIG_MISSING_SECRET')
        }

        if (!process.env.DATABASE_URL) {
          throw new Error('CONFIG_MISSING_DATABASE')
        }

        const normalizedEmail = credentials.email.trim().toLowerCase()

        try {
          const [user] = await db
            .select({
              id: users.id,
              email: users.email,
              name: users.name,
              passwordHash: users.passwordHash,
            })
            .from(users)
            .where(eq(users.email, normalizedEmail))
            .limit(1)

          if (!user) return null

          const valid = await bcrypt.compare(credentials.password, user.passwordHash)
          if (!valid) return null

          return {
            id: user.id,
            email: user.email,
            name: user.name,
          }
        } catch (error) {
          console.error('[NextAuth] authorize 数据库查询失败:', error)
          throw new Error('DATABASE_UNAVAILABLE')
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 天
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        (session.user as { id?: string }).id = token.id as string
      }
      return session
    },
  },
}
