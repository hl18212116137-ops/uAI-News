import { ensureDefaultSubscriptions } from '@/lib/subscriptions'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/drizzle'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { registrationSchema } from '@/lib/registration'

export async function POST(req: Request) {
  try {
    const parsed = registrationSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: '请填写有效邮箱、至少 6 位且不超过 72 字节的密码，以及不超过 80 字的昵称' },
        { status: 400 }
      )
    }

    const { email: normalizedEmail, password, name } = parsed.data

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1)

    if (existing.length > 0) {
      return NextResponse.json(
        { error: '该邮箱已注册' },
        { status: 409 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const [newUser] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        passwordHash,
        name: name || null,
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id, email: users.email })

    if (!newUser) return NextResponse.json({ error: '该邮箱已注册' }, { status: 409 })
    await ensureDefaultSubscriptions(newUser.id, 3)
    return NextResponse.json({ success: true, user: newUser })
  } catch (error) {
    console.error('注册失败:', error)
    return NextResponse.json(
      { error: '注册失败，请稍后重试' },
      { status: 500 }
    )
  }
}
