import { getDefaultAIService } from './ai/ai-factory';
import type { SocialEngagement, XReferencedPost } from '@/lib/types';

export interface XPost {
  post_id: string;
  post_text: string;
  post_url: string;
  posted_at: string;
  /** 推文配图 / 视频 mp4 等 https URL（TwitterAPI.io 各字段兼容） */
  media_urls?: string[];
  /** 互动指标（随 API 字段兼容抽取） */
  social_engagement?: SocialEngagement;
  /** `retweeted_tweet` / `quoted_tweet` 解析结果 */
  referencedPost?: XReferencedPost;
}

/** 从单条 media 对象抽取 URL：视频优先取 mp4 variant，避免再塞一张预览图占两行 */
function urlsFromTweetMediaItem(m: unknown): string[] {
  const urls: string[] = []
  if (!m || typeof m !== 'object') return urls
  const o = m as Record<string, unknown>
  const type = o.type

  if (type === 'video' || type === 'animated_gif') {
    const vi = o.video_info as Record<string, unknown> | undefined
    const variants = vi?.variants
    if (Array.isArray(variants)) {
      let bestUrl: string | null = null
      let bestBr = -1
      for (const v of variants) {
        if (!v || typeof v !== 'object') continue
        const vo = v as Record<string, unknown>
        if (vo.content_type !== 'video/mp4') continue
        const u = vo.url
        const br = typeof vo.bitrate === 'number' ? vo.bitrate : 0
        if (typeof u === 'string' && u.startsWith('https://') && br >= bestBr) {
          bestBr = br
          bestUrl = u
        }
      }
      if (bestUrl) {
        urls.push(bestUrl)
        return urls
      }
    }
  }

  for (const key of ['media_url_https', 'media_url', 'url'] as const) {
    const c = o[key]
    if (typeof c === 'string' && c.startsWith('https://')) {
      urls.push(c)
      break
    }
  }
  return urls
}

/** 从 TwitterAPI.io tweet 对象抽取配图与视频 URL */
export function extractTweetMediaUrls(tweet: Record<string, unknown>): string[] {
  const out: string[] = []

  const tryList = (v: unknown) => {
    if (!Array.isArray(v)) return
    for (const m of v) {
      out.push(...urlsFromTweetMediaItem(m))
    }
  }

  tryList(tweet.media)
  tryList((tweet.extendedEntities as Record<string, unknown> | undefined)?.media)
  tryList((tweet.extended_entities as Record<string, unknown> | undefined)?.media)
  tryList((tweet.attachments as Record<string, unknown> | undefined)?.media)
  const entities = tweet.entities as Record<string, unknown> | undefined
  if (entities?.media) tryList(entities.media)

  return [...new Set(out)]
}

function numMetric(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === 'string' && /^\d+$/.test(v)) return Math.max(0, parseInt(v, 10));
  return undefined;
}

/** 从 TwitterAPI.io / v2 风格 tweet 对象抽取互动数 */
export function extractTweetEngagement(tweet: Record<string, unknown>): SocialEngagement | undefined {
  const out: SocialEngagement = {};
  const pm = tweet.public_metrics as Record<string, unknown> | undefined;
  if (pm && typeof pm === 'object') {
    const r = numMetric(pm.reply_count);
    const rt = numMetric(pm.retweet_count);
    const lk = numMetric(pm.like_count);
    const qt = numMetric(pm.quote_count);
    const bm = numMetric(pm.bookmark_count);
    const im = numMetric(pm.impression_count);
    if (r != null) out.replyCount = r;
    if (rt != null) out.retweetCount = rt;
    if (lk != null) out.likeCount = lk;
    if (qt != null) out.quoteCount = qt;
    if (bm != null) out.bookmarkCount = bm;
    if (im != null) out.impressionCount = im;
  }
  if (out.replyCount == null) {
    const v = numMetric(tweet.reply_count) ?? numMetric(tweet.replyCount);
    if (v != null) out.replyCount = v;
  }
  if (out.retweetCount == null) {
    const v = numMetric(tweet.retweet_count) ?? numMetric(tweet.retweetCount);
    if (v != null) out.retweetCount = v;
  }
  if (out.likeCount == null) {
    const v =
      numMetric(tweet.like_count) ??
      numMetric(tweet.likeCount) ??
      numMetric(tweet.favorite_count) ??
      numMetric(tweet.favoriteCount);
    if (v != null) out.likeCount = v;
  }
  if (out.quoteCount == null) {
    const v = numMetric(tweet.quote_count) ?? numMetric(tweet.quoteCount);
    if (v != null) out.quoteCount = v;
  }
  if (out.bookmarkCount == null) {
    const v = numMetric(tweet.bookmark_count) ?? numMetric(tweet.bookmarkCount);
    if (v != null) out.bookmarkCount = v;
  }
  if (out.impressionCount == null) {
    const v =
      numMetric(tweet.impression_count) ??
      numMetric(tweet.impressionCount) ??
      numMetric(tweet.view_count) ??
      numMetric(tweet.viewCount);
    if (v != null) out.impressionCount = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function tweetBodyText(t: Record<string, unknown>): string {
  const x = t.text ?? t.full_text;
  return typeof x === 'string' ? x : '';
}

function authorFromTweetObj(t: Record<string, unknown>): { userName?: string; name?: string } {
  const author = t.author as Record<string, unknown> | undefined;
  if (!author || typeof author !== 'object') return {};
  const userName =
    typeof author.userName === 'string'
      ? author.userName
      : typeof author.screen_name === 'string'
        ? author.screen_name
        : undefined;
  const name = typeof author.name === 'string' ? author.name : undefined;
  return { userName, name };
}

function innerToReferenced(
  kind: 'retweet' | 'quote',
  inner: Record<string, unknown>
): XReferencedPost | undefined {
  const text = tweetBodyText(inner).trim();
  if (!text) return undefined;
  const { userName, name } = authorFromTweetObj(inner);
  const id =
    typeof inner.id === 'string'
      ? inner.id
      : typeof inner.id === 'number' && Number.isFinite(inner.id)
        ? String(inner.id)
        : typeof inner.id_str === 'string'
          ? inner.id_str
          : undefined;
  const mediaUrls = extractTweetMediaUrls(inner);
  return {
    kind,
    id,
    text,
    userName,
    name,
    ...(mediaUrls.length > 0 ? { mediaUrls } : {}),
  };
}

/**
 * 从 TwitterAPI.io 单条 tweet 解析被转 / 被引内层（`retweeted_tweet`、`quoted_tweet`）。
 * 优先转发内层，否则引用内层。
 */
export function extractReferencedPostFromTweet(tweet: Record<string, unknown>): XReferencedPost | undefined {
  const rt = tweet.retweeted_tweet ?? tweet.retweetedTweet;
  if (rt && typeof rt === 'object') {
    const ref = innerToReferenced('retweet', rt as Record<string, unknown>);
    if (ref) return ref;
  }
  const qt = tweet.quoted_tweet ?? tweet.quotedTweet;
  if (qt && typeof qt === 'object') {
    return innerToReferenced('quote', qt as Record<string, unknown>);
  }
  return undefined;
}

/**
 * 供标题/摘要 AI：纯转发且无附言时用内文；引用帖拼接外层与内层。
 */
export function composeTextForAiProcessing(outer: string, ref?: XReferencedPost | null): string {
  if (!ref?.text?.trim()) return outer;
  if (ref.kind === 'retweet') {
    const o = outer.trim();
    if (!o || /^RT\s@\w+/i.test(o)) return ref.text;
    return `${outer}\n\n---\n${ref.text}`;
  }
  const o = outer.trim();
  if (!o) return ref.text;
  return `${outer}\n\n---\n${ref.text}`;
}

interface XUserInfo {
  handle: string;
  name: string;
  avatar?: string;
  description?: string;  // 博主简介
}

/**
 * 获取X用户信息
 * 通过获取用户的推文来提取用户信息
 * @param handle 用户名（如 sama）
 * @returns 用户信息（包括真实显示名称）
 */
export async function fetchUserInfoFromX(handle: string): Promise<XUserInfo> {
  const apiKey = process.env.TWITTERAPI_IO_KEY;

  if (!apiKey) {
    throw new Error('TWITTERAPI_IO_KEY not configured');
  }

  // 通过获取用户的推文来提取用户信息
  const url = `https://api.twitterapi.io/twitter/user/last_tweets?userName=${handle}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`TwitterAPI.io request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // 从推文数据中提取用户信息
    const tweets = data?.data?.tweets || [];

    if (tweets.length > 0 && tweets[0].author) {
      const author = tweets[0].author;

      // 调试：打印完整的 author 对象结构
      console.log('[DEBUG] Twitter API author object for @' + handle + ':', JSON.stringify(author, null, 2));

      // 提取原始简介：优先使用 profile_bio.description，然后尝试其他字段
      const rawBio = author.profile_bio?.description || author.description || author.bio || author.biography;

      // 使用AI生成简洁的中文简介摘要
      let description: string | undefined = undefined;
      if (rawBio && rawBio.trim()) {
        try {
          const aiService = getDefaultAIService();
          description = await aiService.summarizeAuthorBio(
            rawBio,
            author.name || handle,
            handle
          );
          console.log(`[AI Summary] Generated bio for @${handle}: "${description}"`);
        } catch (error) {
          console.error(`[AI Summary] Failed to generate bio for @${handle}:`, error);
          // 降级方案：使用原始简介的前30个字符
          description = rawBio.substring(0, 30).replace(/https?:\/\/\S+/g, '').trim();
        }
      }

      return {
        handle: author.userName || handle,
        name: author.name || handle,
        avatar: author.profilePicture,
        description: description || undefined,
      };
    }

    // 如果没有推文或没有作者信息，返回 handle 作为名称
    return {
      handle,
      name: handle,
      description: undefined,
    };
  } catch (error) {
    console.error(`Error fetching user info from X for ${handle}:`, error);
    // 降级方案：返回handle作为名称
    return {
      handle,
      name: handle,
      description: undefined,
    };
  }
}

export async function fetchPostsFromX(handle: string): Promise<XPost[]> {
  const apiKey = process.env.TWITTERAPI_IO_KEY;

  if (!apiKey) {
    throw new Error('TWITTERAPI_IO_KEY not configured');
  }

  const url = `https://api.twitterapi.io/twitter/user/last_tweets?userName=${handle}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`TwitterAPI.io request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    const tweets = data?.data?.tweets || [];

    if (!Array.isArray(tweets)) {
      return [];
    }

    // 计算1个月前的时间
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // 过滤并映射推文，只保留最近1个月的（单条解析失败则跳过，避免整 handle 被清空）
    const mapped: XPost[] = []
    for (const tweet of tweets as any[]) {
      try {
        const postedAt = new Date(tweet?.createdAt ?? tweet?.created_at ?? new Date())
        if (postedAt < oneMonthAgo) continue

        const t = tweet as Record<string, unknown>
        const rawId = tweet?.id ?? tweet?.id_str
        const idStr =
          typeof rawId === 'string' || typeof rawId === 'number' ? String(rawId) : ''
        if (!idStr) continue

        const media = extractTweetMediaUrls(t)
        const engagement = extractTweetEngagement(t)
        const referencedPost = extractReferencedPostFromTweet(t)
        mapped.push({
          post_id: idStr,
          post_text: typeof tweet?.text === 'string' ? tweet.text : '',
          post_url: `https://x.com/${handle}/status/${idStr}`,
          posted_at:
            typeof tweet?.createdAt === 'string'
              ? tweet.createdAt
              : typeof tweet?.created_at === 'string'
                ? tweet.created_at
                : new Date().toISOString(),
          ...(media.length > 0 ? { media_urls: media } : {}),
          ...(engagement ? { social_engagement: engagement } : {}),
          ...(referencedPost ? { referencedPost } : {}),
        })
      } catch (rowErr) {
        console.warn(`[fetchPostsFromX] skip malformed tweet for @${handle}:`, rowErr)
      }
    }

    mapped.sort(
      (a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime()
    );

    const capRaw = process.env.FETCH_MAX_POSTS_PER_HANDLE_PER_RUN
    const cap = capRaw != null && capRaw !== '' ? parseInt(capRaw, 10) : NaN
    if (Number.isFinite(cap) && cap > 0) {
      return mapped.slice(0, cap)
    }
    return mapped;
  } catch (error) {
    console.error(`Error fetching posts from X for ${handle}:`, error);
    return [];
  }
}