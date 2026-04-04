import 'server-only'
import {
  mediaUrlsFromDbJson,
  referencedPostFromDbJson,
  socialEngagementFromDbJson,
} from '@/lib/db/news'
import { supabase } from './supabase'
import { NewsItem } from './types'
import { mergeDemoPostsIfFeedEmpty } from './demo-feed-posts'
import { fetchSourceProfilesByHandles, mergeSourceProfilesIntoPosts } from './news-source-enrichment'
import { defaultBioForSourceNotInDb } from './source-bio-fallback'
import { expandHandleQueryVariants, resolveSourceAvatarUrl } from './source-avatar'
import { getFeedPublishedAtGte } from './feed-window'

/** news_items 列：与列表 + INSIGHT 首包映射一致；避免 select('*') 随表膨胀 */
const NEWS_ITEMS_FEED_COLUMNS =
  'id,title,summary,content,source_platform,source_name,source_handle,source_url,category,published_at,original_text,created_at,importance_score,media_urls,social_engagement,referenced_post'

type SourceMeta = {
  id: string
  handle: string
  name: string
  avatar?: string
  description?: string
  postCount: number
  latestPostTime?: string
  sourceType?: 'blogger' | 'media' | 'academic'
}

export type GetRecommendedSourcesOptions = {
  /** 为 true 时在候选池中洗牌后取 limit 条（刷新推荐用） */
  pickRandom?: boolean
  /** 刷新「换一批」时排除当前已展示的推荐 id */
  excludeSourceIds?: string[]
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

/**
 * 获取用户订阅的信息源 handle 列表（用于 feed 查询）
 */
export async function getUserSubscribedHandles(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('user_source_subscriptions')
      .select('source_handle')
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to get subscribed handles:', error)
      return []
    }

    return (data || []).map((row: any) => row.source_handle)
  } catch (error) {
    console.error('Failed to get subscribed handles:', error)
    return []
  }
}

/**
 * 获取用户订阅的信息源 source_id 列表（用于前端按钮状态初始化）
 */
export async function getUserSubscribedSourceIds(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('user_source_subscriptions')
      .select('source_id')
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to get subscribed source ids:', error)
      return []
    }

    return (data || []).map((row: any) => row.source_id)
  } catch (error) {
    console.error('Failed to get subscribed source ids:', error)
    return []
  }
}

/**
 * 订阅信息源
 * 使用 source_handle 唯一约束去重，重复订阅静默忽略
 */
export async function subscribeSource(
  userId: string,
  sourceId: string,
  sourceHandle: string
): Promise<void> {
  const { error } = await supabase
    .from('user_source_subscriptions')
    .insert({ user_id: userId, source_id: sourceId, source_handle: sourceHandle })

  if (error) {
    // 唯一约束冲突（重复订阅）→ 静默忽略
    if (error.code !== '23505') {
      console.error('Failed to subscribe source:', error)
      throw error
    }
  }
}

/**
 * 为“新用户/首次进入”自动补齐默认订阅（3条）
 *
 * 长远考虑：
 * - 不强依赖固定 handles（因为不同环境 sources 表可能不同）
 * - 从 enabled=true 的 sources 里取最近 added_at 的 3 条，尽量保证能有内容展示
 */
export async function ensureDefaultSubscriptions(userId: string, defaultCount = 3): Promise<void> {
  try {
    // 只要存在 1 条订阅，就认为无需补齐
    const { data: existing, error: existError } = await supabase
      .from('user_source_subscriptions')
      .select('source_id')
      .eq('user_id', userId)
      .limit(1);

    if (existError) {
      console.error('Failed to check user subscriptions:', existError);
      return;
    }

    if (existing && existing.length > 0) return;

    // 占位默认订阅源（之后你可以替换成最终 Figma 对应的 handles）
    const placeholderHandles = ['karpathy', 'sama', 'ylecun'];

    const desired = placeholderHandles.slice(0, defaultCount);

    // 1) 优先找这几个 handle 对应的 enabled sources
    const { data: desiredSources, error: desiredError } = await supabase
      .from('sources')
      .select('id, handle')
      .eq('enabled', true)
      .in('handle', desired);

    if (desiredError) {
      console.error('Failed to fetch desired default sources:', desiredError);
      return;
    }

    const picked = (desiredSources || []).slice(0, defaultCount);
    const pickedHandles = new Set(picked.map((s: any) => String(s.handle).toLowerCase()));

    // 2) 不足时，用 enabled 最新的 sources 补齐，保证“3 条”可用
    let enabledSources = picked;
    if (enabledSources.length < defaultCount) {
      const { data: fallbackSources, error: fallbackError } = await supabase
        .from('sources')
        .select('id, handle')
        .eq('enabled', true)
        .order('added_at', { ascending: false })
        .limit(defaultCount * 2);

      if (fallbackError) {
        console.error('Failed to fetch fallback default sources:', fallbackError);
        return;
      }

      const fill = (fallbackSources || [])
        .filter((s: any) => !pickedHandles.has(String(s.handle).toLowerCase()))
        .slice(0, defaultCount - enabledSources.length);

      enabledSources = [...enabledSources, ...fill];
    }

    if (!enabledSources || enabledSources.length === 0) return;

    const inserts = enabledSources.slice(0, defaultCount).map((s: any) => ({
      user_id: userId,
      source_id: s.id,
      source_handle: s.handle,
    }));

    const { error: insertError } = await supabase
      .from('user_source_subscriptions')
      .insert(inserts);

    if (insertError && insertError.code !== '23505') {
      // unique 冲突忽略，其它错误直接记日志
      console.error('Failed to insert default subscriptions:', insertError);
    }
  } catch (error) {
    console.error('ensureDefaultSubscriptions error:', error);
  }
}

const DEFAULT_GUEST_HANDLES = ["karpathy", "sama", "ylecun"];

/**
 * 为“未登录用户/访客”选择默认订阅 source handles（不写入 DB，只做读取）
 * - 优先从 placeholders 找 enabled=true 的源
 * - 不足时用 enabled=true 最新 added_at 的源补齐
 */
export async function getDefaultSubscribedHandles(defaultCount = 3): Promise<string[]> {
  // 只在 placeholders 命中不足时才查 fallback，减少无谓查询
  const desired = DEFAULT_GUEST_HANDLES.slice(0, defaultCount);

  try {
  const { data: desiredSources, error: desiredError } = await supabase
    .from("sources")
    .select("handle")
    .eq("enabled", true)
    .in("handle", desired);

  if (desiredError) {
    console.error("Failed to fetch desired default handles:", desiredError);
    return desired;
  }

  const picked = (desiredSources || []).slice(0, defaultCount).map((s: any) => String(s.handle));
  const pickedSet = new Set(picked.map((h) => h.toLowerCase()));

  if (picked.length >= defaultCount) return picked;

  const { data: fallbackSources, error: fallbackError } = await supabase
    .from("sources")
    .select("handle")
    .eq("enabled", true)
    .order("added_at", { ascending: false })
    .limit(defaultCount * 2);

  if (fallbackError) {
    console.error("Failed to fetch fallback default handles:", fallbackError);
    return picked;
  }

  const fill = (fallbackSources || [])
    .map((s: any) => String(s.handle))
    .filter((h) => !pickedSet.has(h.toLowerCase()))
    .slice(0, defaultCount - picked.length);

  return [...picked, ...fill];
  } catch (err) {
    console.error("getDefaultSubscribedHandles error:", err);
    return desired;
  }
}

/**
 * 基于 source handles 直接获取 feed（用于未登录访客）
 */
export async function getFeedByHandles(handles: string[]): Promise<NewsItem[]> {
  try {
    const normalized = handles.map((h) => h.trim()).filter(Boolean);
    if (normalized.length === 0) return [];

    const feedSince = getFeedPublishedAtGte();
    const { data, error } = await supabase
      .from("news_items")
      .select(NEWS_ITEMS_FEED_COLUMNS)
      .in("source_handle", normalized)
      .gte("published_at", feedSince)
      .order("published_at", { ascending: false });

    if (error) {
      console.error("Failed to get feed by handles:", error);
      const demo = mergeDemoPostsIfFeedEmpty([], normalized);
      const profiles = await fetchSourceProfilesByHandles(normalized);
      return mergeSourceProfilesIntoPosts(demo, profiles);
    }

    const mapped = (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      content: row.content,
      source: {
        platform: row.source_platform,
        name: row.source_name,
        handle: row.source_handle,
        url: row.source_url,
      },
      category: row.category,
      publishedAt: row.published_at,
      originalText: row.original_text,
      createdAt: row.created_at,
      importanceScore: row.importance_score,
      mediaUrls: mediaUrlsFromDbJson(row.media_urls),
      socialEngagement: socialEngagementFromDbJson(row.social_engagement),
      referencedPost: referencedPostFromDbJson(row.referenced_post),
    })) as NewsItem[];

    const profiles = await fetchSourceProfilesByHandles(normalized);
    const enriched = mergeSourceProfilesIntoPosts(mapped, profiles);
    return mergeDemoPostsIfFeedEmpty(enriched, normalized);
  } catch (error) {
    console.error("Failed to get feed by handles:", error);
    const normalized = handles.map((h) => h.trim()).filter(Boolean);
    const demo = mergeDemoPostsIfFeedEmpty([], normalized);
    const profiles = await fetchSourceProfilesByHandles(normalized);
    return mergeSourceProfilesIntoPosts(demo, profiles);
  }
}

/**
 * 基于 source handles 直接获取 SOURCES 面板所需元数据（用于未登录访客）
 */
export async function getSubscribedSourcesMetaByHandles(handles: string[]): Promise<SourceMeta[]> {
  try {
    const normalized = handles.map((h) => h.trim()).filter(Boolean);
    if (normalized.length === 0) return [];

    const nameMap: Record<string, string> = {
      karpathy: "Andrej Karpathy",
      sama: "Sam Altman",
      ylecun: "Yann LeCun",
    };

    const fallbackMeta = (): SourceMeta[] =>
      normalized.slice(0, 3).map((h) => ({
        id: `guest-${h.toLowerCase()}`,
        handle: h,
        name: nameMap[h.toLowerCase()] || h,
        avatar: resolveSourceAvatarUrl(h, undefined, "x"),
        description: defaultBioForSourceNotInDb(h),
        postCount: 0,
        latestPostTime: undefined,
        sourceType: "blogger",
      }));

    // 1) 先拿到这些 handles 对应的 sources 基础信息
    const { data: sourcesData, error: sourcesError } = await supabase
      .from("sources")
      .select("*")
      .in("handle", expandHandleQueryVariants(normalized))
      .eq("enabled", true);

    if (sourcesError) {
      console.error("Failed to fetch sources meta by handles:", sourcesError);
      return fallbackMeta();
    }

    const sources = (sourcesData || []).map((row: any) => ({
      id: row.id,
      handle: row.handle,
      name: row.name,
      avatar: row.avatar,
      description: row.description,
      sourceType: row.source_type,
      platform: row.platform,
    }));

    const handleToSource = new Map<string, typeof sources[number]>();
    for (const s of sources) handleToSource.set(String(s.handle).toLowerCase(), s);

    // 2) 聚合 news_items 的 postCount / latestPostTime（与 feed 可见窗口一致）
    const feedSinceMeta = getFeedPublishedAtGte();
    const { data: postCounts, error: countsError } = await supabase
      .from("news_items")
      .select("source_handle, published_at")
      .in("source_handle", normalized)
      .gte("published_at", feedSinceMeta);

    if (countsError) {
      console.error("Failed to aggregate post counts by handles:", countsError);
    }

    const countMap = new Map<string, { count: number; latest?: string }>();
    for (const item of postCounts || []) {
      const h = String(item.source_handle).toLowerCase();
      const publishedAt = item.published_at;
      const prev = countMap.get(h) || { count: 0, latest: undefined };
      const nextLatest =
        prev.latest && publishedAt ? (new Date(publishedAt).getTime() > new Date(prev.latest).getTime() ? publishedAt : prev.latest) : publishedAt;
      countMap.set(h, { count: prev.count + 1, latest: nextLatest });
    }

    const guestRow = (h: string): SourceMeta => ({
      id: `guest-${h.toLowerCase()}`,
      handle: h,
      name: nameMap[h.toLowerCase()] || h,
      avatar: resolveSourceAvatarUrl(h, undefined, "x"),
      description: defaultBioForSourceNotInDb(h),
      postCount: 0,
      latestPostTime: undefined,
      sourceType: "blogger",
    });

    // 3) 输出顺序与 handles 输入一致；库中无 enabled 行时仍返回占位（与 fallback 一致）
    const out: SourceMeta[] = [];
    for (const h of normalized) {
      const key = h.toLowerCase();
      const src = handleToSource.get(key);
      const meta = countMap.get(key) || { count: 0, latest: undefined };
      if (src) {
        out.push({
          id: src.id,
          handle: src.handle,
          name: src.name,
          avatar: resolveSourceAvatarUrl(src.handle, src.avatar, src.platform),
          description: src.description,
          postCount: meta.count,
          latestPostTime: meta.latest,
          sourceType: src.sourceType as any,
        });
      } else {
        out.push(guestRow(h));
      }
    }

    return out;
  } catch (error) {
    console.error("getSubscribedSourcesMetaByHandles error:", error);
    // 断网/环境未配置时，至少给 UI 返回默认 SOURCES 占位，避免“展不开/空白”的观感
    const normalized = handles.map((h) => h.trim()).filter(Boolean);
    const nameMap: Record<string, string> = {
      karpathy: "Andrej Karpathy",
      sama: "Sam Altman",
      ylecun: "Yann LeCun",
    };
    return normalized.slice(0, 3).map((h) => ({
      id: `guest-${h.toLowerCase()}`,
      handle: h,
      name: nameMap[h.toLowerCase()] || h,
      avatar: resolveSourceAvatarUrl(h, undefined, "x"),
      description: defaultBioForSourceNotInDb(h),
      postCount: 0,
      latestPostTime: undefined,
      sourceType: "blogger",
    }));
  }
}

/**
 * 取消订阅
 */
export async function isUserSubscribedToSource(
  userId: string,
  sourceId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_source_subscriptions')
      .select('source_id')
      .eq('user_id', userId)
      .eq('source_id', sourceId)
      .limit(1)
      .maybeSingle()

    if (error) return false
    return !!data
  } catch {
    return false
  }
}

export async function unsubscribeSource(userId: string, sourceId: string): Promise<void> {
  const { error } = await supabase
    .from('user_source_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('source_id', sourceId)

  if (error) {
    console.error('Failed to unsubscribe source:', error)
    throw error
  }
}

/**
 * 获取用户的个性化 feed
 * 未传 `subscribedHandles` 时：先查订阅 handles 再拉 news_items；传入时可省一次往返（与首页已算好的 handles 对齐）。
 */
export async function getSubscribedFeed(
  userId: string,
  subscribedHandles?: string[]
): Promise<NewsItem[]> {
  try {
    const handles =
      subscribedHandles !== undefined
        ? subscribedHandles.map((h) => h.trim()).filter(Boolean)
        : await getUserSubscribedHandles(userId)

    if (handles.length === 0) return []

    const feedSinceSub = getFeedPublishedAtGte()
    const { data, error } = await supabase
      .from('news_items')
      .select(NEWS_ITEMS_FEED_COLUMNS)
      .in('source_handle', handles)
      .gte('published_at', feedSinceSub)
      .order('published_at', { ascending: false })

    if (error) {
      console.error('Failed to get subscribed feed:', error)
      const demo = mergeDemoPostsIfFeedEmpty([], handles)
      const profiles = await fetchSourceProfilesByHandles(handles)
      return mergeSourceProfilesIntoPosts(demo, profiles)
    }

    const mapped = (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      content: row.content,
      source: {
        platform: row.source_platform,
        name: row.source_name,
        handle: row.source_handle,
        url: row.source_url,
      },
      category: row.category,
      publishedAt: row.published_at,
      originalText: row.original_text,
      createdAt: row.created_at,
      importanceScore: row.importance_score,
      mediaUrls: mediaUrlsFromDbJson(row.media_urls),
      socialEngagement: socialEngagementFromDbJson(row.social_engagement),
      referencedPost: referencedPostFromDbJson(row.referenced_post),
    })) as NewsItem[]

    const profiles = await fetchSourceProfilesByHandles(handles)
    const enriched = mergeSourceProfilesIntoPosts(mapped, profiles)
    return mergeDemoPostsIfFeedEmpty(enriched, handles)
  } catch (error) {
    console.error('Failed to get subscribed feed:', error)
    try {
      const handles =
        subscribedHandles !== undefined
          ? subscribedHandles.map((h) => h.trim()).filter(Boolean)
          : await getUserSubscribedHandles(userId)
      const demo = mergeDemoPostsIfFeedEmpty([], handles)
      const profiles = await fetchSourceProfilesByHandles(handles)
      return mergeSourceProfilesIntoPosts(demo, profiles)
    } catch {
      return []
    }
  }
}

export type SubscribedSourcesMetaResult = {
  sources: SourceMeta[]
  /** 与 `getUserSubscribedSourceIds` 同源（订阅表全量 source_id，含侧栏未展示的孤儿行） */
  subscribedSourceIds: string[]
}

/**
 * 获取用户已订阅信息源的元数据（供 SourcesList 展示）
 * 两步查询：先取订阅记录 → 再批量查 sources 表 → 聚合 postCount
 */
export async function getSubscribedSourcesMeta(userId: string): Promise<SubscribedSourcesMetaResult> {
  try {
    // 第一步：取订阅的 source_id 列表
    const { data: subscriptions, error: subError } = await supabase
      .from('user_source_subscriptions')
      .select('source_id, source_handle')
      .eq('user_id', userId)

    if (subError || !subscriptions || subscriptions.length === 0) {
      return { sources: [], subscribedSourceIds: [] }
    }

    const subscribedSourceIds = (subscriptions as { source_id: string }[]).map((s) =>
      String(s.source_id)
    )
    const sourceIds = subscriptions.map((s: any) => s.source_id)
    const handles = subscriptions.map((s: any) => s.source_handle)

    // 第二步：批量查 sources 表
    const [{ data: sourcesData }, { data: postCounts }] = await Promise.all([
      supabase
        .from('sources')
        .select('id,handle,name,avatar,description,platform,source_type')
        .in('id', sourceIds),
      // 聚合每个 handle 的文章数和最新发布时间（与 feed 可见窗口一致）
      supabase
        .from('news_items')
        .select('source_handle, published_at')
        .in('source_handle', handles)
        .gte('published_at', getFeedPublishedAtGte()),
    ])

    // 计算 postCount 和 latestPostTime
    const countMap = new Map<string, { count: number; latest?: string }>()
    for (const item of postCounts || []) {
      const key = (item.source_handle as string).toLowerCase()
      const existing = countMap.get(key) || { count: 0 }
      existing.count += 1
      if (!existing.latest || item.published_at > existing.latest) {
        existing.latest = item.published_at
      }
      countMap.set(key, existing)
    }

    const idToSource = new Map<string, any>()
    for (const s of sourcesData || []) idToSource.set(String(s.id), s)

    const ordered: SourceMeta[] = []
    for (const sub of subscriptions as any[]) {
      const s = idToSource.get(String(sub.source_id))
      if (!s) continue
      const h = String(sub.source_handle || s.handle || '').toLowerCase()
      const stats = countMap.get(h) || { count: 0 }
      ordered.push({
        id: s.id,
        handle: s.handle,
        name: s.name,
        avatar: resolveSourceAvatarUrl(s.handle, s.avatar, s.platform),
        description: s.description,
        postCount: stats.count,
        latestPostTime: stats.latest,
        sourceType: s.source_type,
      })
    }
    return { sources: ordered, subscribedSourceIds }
  } catch (error) {
    console.error('Failed to get subscribed sources meta:', error)
    return { sources: [], subscribedSourceIds: [] }
  }
}

/**
 * DB 不可用时 RECOMMEND 占位（id 前缀 uai-demo-rec-，无真实外键，仅展示）。
 * 仍按 handle 合并 sources 表中的 avatar/description，有则展示真实资料。
 */
async function demoRecommendedSourceMetas(limit: number): Promise<SourceMeta[]> {
  const rows = [
    { handle: 'huggingface', name: 'Hugging Face', sourceType: 'media' as const },
    { handle: 'ylecun', name: 'Yann LeCun', sourceType: 'blogger' as const },
    { handle: 'ilyasut', name: 'Ilya Sutskever', sourceType: 'blogger' as const },
    { handle: 'sama', name: 'Sam Altman', sourceType: 'blogger' as const },
    { handle: 'karpathy', name: 'Andrej Karpathy', sourceType: 'blogger' as const },
  ].slice(0, Math.max(1, limit))

  const handles = rows.map((r) => r.handle)
  const byHandle = new Map<
    string,
    { avatar?: string | null; description?: string | null; name?: string | null; platform?: string | null }
  >()
  try {
    const { data: dbRows } = await supabase
      .from('sources')
      .select('handle, avatar, description, name, platform')
      .in('handle', expandHandleQueryVariants(handles))
    for (const row of dbRows || []) {
      byHandle.set(String(row.handle).toLowerCase(), {
        avatar: row.avatar,
        description: row.description,
        name: row.name,
        platform: row.platform,
      })
    }
  } catch {
    // 合并失败则仅用占位文案
  }

  return rows.map((r) => {
    const db = byHandle.get(r.handle.toLowerCase())
    const dbName = db?.name && String(db.name).trim()
    const dbDesc = db?.description && String(db.description).trim()
    return {
      id: `uai-demo-rec-${r.handle}`,
      handle: r.handle,
      name: dbName || r.name,
      avatar: resolveSourceAvatarUrl(r.handle, db?.avatar, db?.platform ?? null),
      description: dbDesc || defaultBioForSourceNotInDb(r.handle),
      postCount: 0,
      sourceType: r.sourceType,
    }
  })
}

/**
 * 获取全局热门推荐信息源（排除已订阅的）
 * 供 SourcesList 的"推荐关注"区块使用，以及未登录/无订阅时的引导
 */
export async function getRecommendedSources(
  userId: string | null,
  limit = 8,
  options?: GetRecommendedSourcesOptions
): Promise<SourceMeta[]> {
  const recommendedSourcesColumns =
    'id, handle, name, avatar, description, platform, source_type'

  try {
    let allSources: any[] | null = null

    const enabledRes = await supabase
      .from('sources')
      .select(recommendedSourcesColumns)
      .eq('enabled', true)
    if (!enabledRes.error && enabledRes.data?.length) {
      allSources = enabledRes.data
    } else {
      const anyRes = await supabase.from('sources').select(recommendedSourcesColumns).limit(200)
      if (!anyRes.error && anyRes.data?.length) {
        allSources = anyRes.data
      }
    }

    if (!allSources?.length) {
      return await demoRecommendedSourceMetas(limit)
    }

    let excludeHandles: string[] = []
    if (userId) {
      excludeHandles = await getUserSubscribedHandles(userId)
    }

    const unsubscribed = allSources.filter(
      (s: any) => !excludeHandles.map((h) => h.toLowerCase()).includes(String(s.handle || '').toLowerCase())
    )

    const pool: typeof allSources =
      unsubscribed.length > 0 ? unsubscribed : allSources

    const handles = pool
      .map((s: any) => s.handle)
      .filter((h: unknown): h is string => typeof h === 'string' && h.length > 0)

    if (handles.length === 0) {
      return await demoRecommendedSourceMetas(limit)
    }

    const feedSinceRec = getFeedPublishedAtGte()
    const { data: postCounts, error: countError } = await supabase
      .from('news_items')
      .select('source_handle')
      .in('source_handle', handles)
      .gte('published_at', feedSinceRec)

    if (countError) {
      console.error('Recommended sources: postCounts query failed', countError)
    }

    const countMap = new Map<string, number>()
    for (const item of postCounts || []) {
      const key = (item.source_handle as string).toLowerCase()
      countMap.set(key, (countMap.get(key) || 0) + 1)
    }

    const mapped = pool.map((s: any) => ({
      id: String(s.id),
      handle: s.handle,
      name: s.name,
      avatar: resolveSourceAvatarUrl(s.handle, s.avatar, s.platform),
      description: s.description,
      postCount: countMap.get(String(s.handle || '').toLowerCase()) || 0,
      sourceType: s.source_type,
    })) as SourceMeta[]

    let candidates = mapped
    const exIds = options?.excludeSourceIds?.filter(Boolean) ?? []
    if (exIds.length > 0) {
      const ex = new Set(exIds.map(String))
      const filtered = mapped.filter((c) => !ex.has(String(c.id)))
      candidates = filtered.length > 0 ? filtered : mapped
    }

    if (candidates.length === 0) {
      return await demoRecommendedSourceMetas(limit)
    }

    if (options?.pickRandom) {
      shuffleInPlace(candidates)
      const picked = candidates.slice(0, limit)
      if (picked.length === 0) {
        return await demoRecommendedSourceMetas(limit)
      }
      return picked
    }

    const ranked = [...candidates]
      .sort((a, b) => b.postCount - a.postCount)
      .slice(0, limit)

    if (ranked.length === 0) {
      return await demoRecommendedSourceMetas(limit)
    }

    return ranked
  } catch (error) {
    console.error('Failed to get recommended sources:', error)
    return await demoRecommendedSourceMetas(limit)
  }
}

/**
 * 获取精选推荐文章（用于未登录或无订阅用户的首页 feed）
 * 按 importance_score 降序取最重要的文章
 */
export async function getTopRecommendedPosts(limit = 30): Promise<NewsItem[]> {
  const demoFallbackHandles = DEFAULT_GUEST_HANDLES
  try {
    const feedSinceTop = getFeedPublishedAtGte()
    const { data, error } = await supabase
      .from('news_items')
      .select(NEWS_ITEMS_FEED_COLUMNS)
      .not('importance_score', 'is', null)
      .gte('published_at', feedSinceTop)
      .order('importance_score', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Failed to get top recommended posts:', error)
      return mergeDemoPostsIfFeedEmpty([], demoFallbackHandles)
    }

    const mapped = (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      content: row.content,
      source: {
        platform: row.source_platform,
        name: row.source_name,
        handle: row.source_handle,
        url: row.source_url,
      },
      category: row.category,
      publishedAt: row.published_at,
      originalText: row.original_text,
      createdAt: row.created_at,
      importanceScore: row.importance_score,
      mediaUrls: mediaUrlsFromDbJson(row.media_urls),
      socialEngagement: socialEngagementFromDbJson(row.social_engagement),
      referencedPost: referencedPostFromDbJson(row.referenced_post),
    })) as NewsItem[]

    return mergeDemoPostsIfFeedEmpty(mapped, demoFallbackHandles)
  } catch (error) {
    console.error('Failed to get top recommended posts:', error)
    return mergeDemoPostsIfFeedEmpty([], demoFallbackHandles)
  }
}
