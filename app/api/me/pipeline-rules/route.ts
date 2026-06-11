import { z } from 'zod'

import { requireAuth } from '@/lib/auth'
import {
  clampRecommendationVisibleDays,
  createRule,
  deleteRule,
  GENERAL_TYPES,
  isPipelineRuleModule,
  isValidRuleTypeForModule,
  listRulesForModules,
  listRules,
  MAX_PAYLOAD_STRING_LEN,
  PIPELINE_RULE_MODULES,
  RECOMMENDATION_TYPES,
  type PipelineRuleModule,
} from '@/lib/user-pipeline-rules'

const moduleSchema = z.enum(PIPELINE_RULE_MODULES)

const postBodySchema = z
  .object({
    module: moduleSchema,
    ruleType: z.string().min(1).max(64),
    payload: z.record(z.string(), z.any()),
  })
  .superRefine((val, ctx) => {
    if (!isValidRuleTypeForModule(val.module, val.ruleType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `ruleType 须为：${[...GENERAL_TYPES, ...RECOMMENDATION_TYPES].join(', ')}`,
      })
    }

    const p = val.payload
    const strOk = (s: unknown, field: string) => {
      if (typeof s !== 'string') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field} 须为字符串` })
        return
      }
      if (s.trim().length < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field} 不能为空` })
      }
      if (s.length > MAX_PAYLOAD_STRING_LEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} 最长 ${MAX_PAYLOAD_STRING_LEN} 字符`,
        })
      }
    }

    if (val.ruleType === 'hide_if_contains') {
      if (val.module !== 'recommendation') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: '隐藏关键词只用于个人推荐规则' })
      }
      strOk(p.substring, 'substring')
    }
    if (val.ruleType === 'prefer_keyword') {
      if (val.module !== 'recommendation') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: '优先关键词只用于个人推荐规则' })
      }
      strOk(p.keyword, 'keyword')
    }
    if (val.ruleType === 'recommendation_visible_days') {
      if (val.module !== 'recommendation') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: '可见天数只用于个人推荐规则' })
      }
      const n = p.days
      if (typeof n !== 'number' || !Number.isInteger(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'days 须为整数' })
      }
    }
    if (val.ruleType === 'plain_rule') {
      strOk(p.text, 'text')
    }
    if (val.ruleType === 'disable_builtin_rule') {
      strOk(p.ruleId, 'ruleId')
    }
  })

/** 当前用户的筛选规则（各步骤自定义规则 + 个人推荐实际生效规则） */
export async function GET(request: Request) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const { searchParams } = new URL(request.url)
  const mod = searchParams.get('module')
  if (mod === 'all') {
    try {
      const rules = await listRulesForModules(user.id)
      return Response.json({ success: true, rules })
    } catch (e) {
      const message = e instanceof Error ? e.message : '读取失败'
      return Response.json({ error: message }, { status: 500 })
    }
  }

  if (!isPipelineRuleModule(mod)) {
    return Response.json({ error: '缺少或非法 module 参数' }, { status: 400 })
  }
  const parsedMod = moduleSchema.safeParse(mod)
  if (!parsedMod.success) {
    return Response.json({ error: '缺少或非法 module 参数' }, { status: 400 })
  }

  try {
    const rules = await listRules(user.id, parsedMod.data as PipelineRuleModule)
    return Response.json({ success: true, rules })
  } catch (e) {
    const message = e instanceof Error ? e.message : '读取失败'
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return Response.json({ error: '请求体须为 JSON' }, { status: 400 })
  }

  const parsed = postBodySchema.safeParse(json)
  if (!parsed.success) {
    return Response.json(
      { error: '参数无效', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { module, ruleType, payload } = parsed.data

  let payloadOut: Record<string, unknown> = { ...payload }
  if (ruleType === 'recommendation_visible_days') {
    const d = clampRecommendationVisibleDays(Number(payload.days))
    payloadOut = { days: d }
  }

  try {
    const rule = await createRule(user.id, module, ruleType, payloadOut)
    return Response.json({ success: true, rule })
  } catch (e) {
    const message = e instanceof Error ? e.message : '创建失败'
    const status = message.includes('最多') ? 400 : 500
    return Response.json({ error: message }, { status })
  }
}

export async function DELETE(request: Request) {
  const { user, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const id = new URL(request.url).searchParams.get('id')
  if (!id?.trim()) {
    return Response.json({ error: '缺少 id 参数' }, { status: 400 })
  }

  try {
    const ok = await deleteRule(user.id, id.trim())
    if (!ok) return Response.json({ error: '规则不存在或无权删除' }, { status: 404 })
    return Response.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : '删除失败'
    return Response.json({ error: message }, { status: 500 })
  }
}
