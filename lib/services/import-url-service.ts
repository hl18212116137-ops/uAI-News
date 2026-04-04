import 'server-only'

import { importFromUrl } from '@/lib/import/import-service'

/** 与 lib/import/import-service 一致；S1 仅委托，便于 S3+ 改为入队 */
export async function importContentFromUrl(url: string) {
  return importFromUrl(url)
}
