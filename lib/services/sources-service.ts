import 'server-only'

import { taskManager } from '@/lib/task-manager'
import {
  getSources,
  addSource,
  deleteSource,
  updateSource,
  getSourceById,
  extractSourceFromUrl,
  type Source,
} from '@/lib/sources'
import { deletePostsByHandle } from '@/lib/db/news'
import { isUserSubscribedToSource, subscribeSource } from '@/lib/subscriptions'
import { fetchAndProcessPostsInBackground } from '@/lib/source-fetch-background'

export async function listSources(): Promise<Source[]> {
  return getSources()
}

export async function addSourceFromUrlWithBackgroundFetch(params: {
  url: string
  user: { id: string } | null
}): Promise<{
  source: Source
  taskId: string
  isLoggedIn: boolean
  message: string
}> {
  const { url, user } = params

  const sourceData = await extractSourceFromUrl(url)

  const source: Source = {
    id: sourceData.id!,
    sourceType: sourceData.sourceType!,
    platform: sourceData.platform!,
    handle: sourceData.handle!,
    name: sourceData.name!,
    url: sourceData.url!,
    avatar: sourceData.avatar,
    description: sourceData.description,
    enabled: sourceData.enabled!,
    addedAt: sourceData.addedAt!,
    fetchConfig: sourceData.fetchConfig,
  }

  await addSource(source)

  if (user) {
    await subscribeSource(user.id, source.id, source.handle)
  }

  const taskId = taskManager.createTask()
  taskManager.updateTask(taskId, {
    status: 'running',
    progress: 0,
    message: `正在抓取 @${source.handle} 的推文...`,
    startTime: Date.now(),
    estimatedDuration: 120,
    remainingTime: 120,
  })

  fetchAndProcessPostsInBackground(source, taskId).catch(error => {
    console.error(`[后台任务] 抓取 @${source.handle} 失败:`, error)
    taskManager.updateTask(taskId, {
      status: 'failed',
      error: error.message,
    })
  })

  return {
    source,
    taskId,
    isLoggedIn: !!user,
    message: `已添加博主 @${source.handle}`,
  }
}

export async function deleteSourceByIdAndPosts(id: string): Promise<{
  deletedPostsCount: number
  message: string
}> {
  const source = await getSourceById(id)
  if (!source) {
    throw new Error('源不存在')
  }

  const deletedPostsCount = await deletePostsByHandle(source.handle)
  await deleteSource(id)

  const message =
    deletedPostsCount > 0
      ? `删除成功，同时删除了 ${deletedPostsCount} 条相关推文`
      : '删除成功'

  return { deletedPostsCount, message }
}

export async function patchSourceById(
  id: string,
  updates: Partial<Source>
): Promise<void> {
  await updateSource(id, updates)
}

export type StartSubscribedSourceFetchResult =
  | { ok: true; taskId: string }
  | { ok: false; status: 400 | 403 | 404; error: string }

/** POST /api/sources/fetch：已订阅单源后台抓取 */
export async function startFetchForSubscribedSource(
  userId: string,
  sourceId: string
): Promise<StartSubscribedSourceFetchResult> {
  if (!sourceId) {
    return { ok: false, status: 400, error: '请提供 sourceId' }
  }

  const subscribed = await isUserSubscribedToSource(userId, sourceId)
  if (!subscribed) {
    return { ok: false, status: 403, error: '未订阅该信息源' }
  }

  const source = await getSourceById(sourceId)
  if (!source) {
    return { ok: false, status: 404, error: '信息源不存在' }
  }

  const taskId = taskManager.createTask()
  taskManager.updateTask(taskId, {
    status: 'running',
    progress: 0,
    message: `正在抓取 @${source.handle} 的推文...`,
    startTime: Date.now(),
    estimatedDuration: 120,
    remainingTime: 120,
  })

  fetchAndProcessPostsInBackground(source, taskId).catch((error) => {
    console.error(`[sources/fetch] 抓取 @${source.handle} 失败:`, error)
    taskManager.updateTask(taskId, {
      status: 'failed',
      error: error instanceof Error ? error.message : '未知错误',
    })
  })

  return { ok: true, taskId }
}
