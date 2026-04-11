import 'server-only'

import { isMostlyChinese } from '@/lib/text-locale'
import type { XReferencedPost } from '@/lib/types'

/**
 * 信息流 / INSIGHT 展示的「原文」统一为中文：非中文的外层与引用推文各调用一次 translate。
 * 与全文 translate（用于 content）并行调用时可减少总耗时。
 */
export async function translateNewsOriginalToChinese(
  translateContent: (s: string) => Promise<string>,
  outerText: string,
  referencedPost: XReferencedPost | undefined,
): Promise<{ originalText: string; referencedPost?: XReferencedPost }> {
  const outer = outerText ?? ''
  const needOuter = outer.trim().length > 0 && !isMostlyChinese(outer)

  const ref = referencedPost
  const needRef = Boolean(ref?.text?.trim()) && !isMostlyChinese(ref!.text)

  const [outerResult, refResult] = await Promise.all([
    needOuter ? translateContent(outer) : Promise.resolve(outer),
    needRef && ref ? translateContent(ref.text) : Promise.resolve<string | null>(null),
  ])

  const nextRef =
    ref && needRef && refResult != null ? { ...ref, text: refResult } : ref

  return {
    originalText: needOuter ? outerResult : outer,
    referencedPost: nextRef,
  }
}
