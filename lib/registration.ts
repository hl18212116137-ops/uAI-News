import { z } from 'zod'

export const registrationSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(6).max(72).refine((value) => new TextEncoder().encode(value).length <= 72, '密码不能超过 72 字节'),
  name: z.string().trim().max(80).optional(),
})
