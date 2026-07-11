import type { SocialEngagement, XReferencedPost } from '@/lib/types';
import { isFallbackSourceAvatarUrl } from './source-avatar';

export interface XPost {
  post_id: string;
  post_text: string;
  post_url: string;
  posted_at: string;
  /** 推文配图 / 视频 mp4 等 https URL（TwitterAPI.io 各字段兼容） */
  media_urls?: string[];
  /** 推文正文里的展开链接（优先 expanded_url，避免只存 t.co 短链） */
  urls?: string[];
  /** 互动指标（随 API 字段兼容抽取） */
  social_engagement?: SocialEngagement;
  /** `retweeted_tweet` / `quoted_tweet` 解析结果 */
  referencedPost?: XReferencedPost;
}

export type XArticle = {
  id?: string;
  title: string;
  previewText?: string;
  text: string;
  url?: string;
  createdAt?: string;
  authorName?: string;
  authorHandle?: string;
  mediaUrls?: string[];
  originalWordCount: number;
};

export type XConversationPost = {
  post_id: string;
  post_text: string;
  post_url: string;
  posted_at: string;
  author_name: string;
  handle: string;
  urls?: string[];
  media_urls?: string[];
  in_reply_to_id?: string;
  referencedPost?: XReferencedPost;
  raw?: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function envIntInRange(name: string, fallback: number, min: number, max: number): number {
  const raw = parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

function getFetchTweetPageLimit(): number {
  return envIntInRange('FETCH_MAX_TWEET_PAGES_PER_HANDLE_PER_RUN', 3, 1, 10);
}

function getFetchPostLimit(): number | null {
  const raw = process.env.FETCH_MAX_POSTS_PER_HANDLE_PER_RUN;
  if (raw == null || raw === '') return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nestedString(value: unknown, keys: string[]): string {
  let current: unknown = value;
  for (const key of keys) {
    const record = asRecord(current);
    if (!record) return '';
    current = record[key];
  }
  return cleanString(current);
}

function bestTextCandidate(candidates: string[]): string {
  return candidates
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? '';
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

export function extractTweetBodyText(t: Record<string, unknown>): string {
  return bestTextCandidate([
    nestedString(t.note_tweet, ['text']),
    nestedString(t.noteTweet, ['text']),
    nestedString(t.extended_tweet, ['full_text']),
    nestedString(t.extendedTweet, ['fullText']),
    cleanString(t.full_text),
    cleanString(t.fullText),
    cleanString(t.text),
  ]);
}

function tweetBodyText(t: Record<string, unknown>): string {
  return extractTweetBodyText(t);
}

function authorFromTweetObj(t: Record<string, unknown>): { userName?: string; name?: string } {
  const author = asRecord(t.author) ?? asRecord(t.user);
  if (!author) return {};
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
  const urls = extractEntityUrls(inner);
  return {
    kind,
    id,
    text,
    userName,
    name,
    ...(urls.length > 0 ? { urls } : {}),
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

function countWords(text: string): number {
  const latin = text.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0;
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return latin + Math.ceil(cjk / 2);
}

function extractEntityUrls(tweet: Record<string, unknown>): string[] {
  const entities = asRecord(tweet.entities);
  const urls = entities?.urls;
  if (!Array.isArray(urls)) return [];

  const out = new Set<string>();
  for (const item of urls) {
    const record = asRecord(item);
    if (!record) continue;
    for (const key of ['expanded_url', 'expandedUrl', 'unwound_url', 'unwoundUrl', 'url'] as const) {
      const value = record[key];
      const cleaned = cleanString(value);
      if (/^https?:\/\//i.test(cleaned)) out.add(cleaned);
    }
  }
  return Array.from(out);
}

export function hasXArticleEntity(tweet: Record<string, unknown>): boolean {
  return extractEntityUrls(tweet).some((url) => /(?:x\.com|twitter\.com)\/i\/article\//i.test(url));
}

function articleTextFromContents(contents: unknown): { text: string; mediaUrls: string[] } {
  if (!Array.isArray(contents)) return { text: '', mediaUrls: [] };

  const paragraphs: string[] = [];
  const mediaUrls = new Set<string>();
  for (const item of contents) {
    const block = asRecord(item);
    if (!block) continue;

    const text = cleanString(block.text);
    if (text) paragraphs.push(text);

    const url = cleanString(block.url);
    if (url.startsWith('https://') && !text) mediaUrls.add(url);
    const previewUrl = cleanString(block.previewUrl);
    if (previewUrl.startsWith('https://')) mediaUrls.add(previewUrl);
  }

  return {
    text: paragraphs.join('\n\n').trim(),
    mediaUrls: Array.from(mediaUrls),
  };
}

function normalizeXArticle(article: unknown, tweetId: string, fallbackUrl?: string): XArticle | undefined {
  const record = asRecord(article);
  if (!record) return undefined;

  const { text, mediaUrls } = articleTextFromContents(record.contents);
  if (!text) return undefined;

  const author = asRecord(record.author);
  const authorHandle = cleanString(author?.userName) || cleanString(author?.screen_name);
  const authorName = cleanString(author?.name) || authorHandle;
  const title = cleanString(record.title) || cleanString(record.preview_text).slice(0, 120) || 'X Article';
  const url = fallbackUrl || (authorHandle ? `https://x.com/${authorHandle}/status/${tweetId}` : undefined);
  const coverUrl = cleanString(record.cover_media_img_url);
  if (coverUrl.startsWith('https://')) mediaUrls.unshift(coverUrl);

  return {
    id: cleanString(record.id) || undefined,
    title,
    previewText: cleanString(record.preview_text) || undefined,
    text,
    url,
    createdAt: cleanString(record.createdAt) || cleanString(record.created_at) || undefined,
    authorName: authorName || undefined,
    authorHandle: authorHandle || undefined,
    mediaUrls: Array.from(new Set(mediaUrls)),
    originalWordCount: countWords(text),
  };
}

export async function fetchXArticleByTweetId(
  tweetId: string,
  fallbackUrl?: string,
): Promise<XArticle | undefined> {
  const apiKey = process.env.TWITTERAPI_IO_KEY;
  if (!apiKey) {
    throw new Error('TWITTERAPI_IO_KEY not configured');
  }

  const idStr = String(tweetId).trim();
  const url = `https://api.twitterapi.io/twitter/article?tweet_id=${encodeURIComponent(idStr)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'X-API-Key': apiKey },
  });
  if (!response.ok) return undefined;

  const data = await response.json();
  if (data?.status && data.status !== 'success') return undefined;
  return normalizeXArticle(data?.article, idStr, fallbackUrl);
}

interface XUserInfo {
  handle: string;
  name: string;
  avatar?: string;
  description?: string;  // 博主简介
}

function cleanedAuthorBio(rawBio: unknown): string | undefined {
  if (typeof rawBio !== 'string') return undefined;
  const cleaned = rawBio
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return undefined;
  return cleaned.length > 160 ? `${cleaned.slice(0, 157).trim()}...` : cleaned;
}

function parseXUserInfo(user: unknown, fallbackHandle: string): XUserInfo | null {
  if (!user || typeof user !== 'object') return null;
  const data = user as Record<string, any>;
  const handle =
    typeof data.userName === 'string' && data.userName.trim()
      ? data.userName.trim()
      : fallbackHandle;
  const name =
    typeof data.name === 'string' && data.name.trim()
      ? data.name.trim()
      : handle;
  const rawAvatar =
    typeof data.profilePicture === 'string' && data.profilePicture.trim()
      ? data.profilePicture.trim()
      : undefined;
  const avatar = rawAvatar && !isFallbackSourceAvatarUrl(rawAvatar) ? rawAvatar : undefined;
  const rawBio = data.profile_bio?.description || data.description || data.bio || data.biography;
  const description = cleanedAuthorBio(rawBio);

  return {
    handle,
    name,
    ...(avatar ? { avatar } : {}),
    ...(description ? { description } : {}),
  };
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

  try {
    const profileUrl = `https://api.twitterapi.io/twitter/user/info?userName=${encodeURIComponent(handle)}`;
    const profileResponse = await fetch(profileUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
      },
    });

    if (profileResponse.ok) {
      const profileData = await profileResponse.json();
      const userInfo = parseXUserInfo(profileData?.data, handle);
      if (userInfo && (profileData?.status !== 'error' || userInfo.avatar || userInfo.description)) {
        return userInfo;
      }
    }

    // 资料接口不可用时，回退到最近推文里的 author 对象。
    const url = `https://api.twitterapi.io/twitter/user/last_tweets?userName=${encodeURIComponent(handle)}`;
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

      if (process.env.DEBUG_X_USER_INFO === '1') {
        console.log('[DEBUG] Twitter API author object for @' + handle + ':', JSON.stringify(author, null, 2));
      }

      return parseXUserInfo(author, handle) ?? { handle, name: handle };
    }

    // 如果没有推文或没有作者信息，返回 handle 作为名称
    return {
      handle,
      name: handle,
      description: undefined,
    };
  } catch (error) {
    console.error(`Error fetching user info from X for ${handle}:`, error);
    return {
      handle,
      name: handle,
      description: undefined,
    };
  }
}

/** 按 snowflake ID 拉取单条推文（TwitterAPI.io） */
export async function fetchTweetById(
  tweetId: string,
  handleHint?: string,
): Promise<{
  post_id: string;
  post_text: string;
  post_url: string;
  posted_at: string;
  author_name: string;
  handle: string;
  urls?: string[];
  media_urls?: string[];
  social_engagement?: SocialEngagement;
  referencedPost?: XReferencedPost;
  raw?: Record<string, unknown>;
}> {
  const apiKey = process.env.TWITTERAPI_IO_KEY;
  if (!apiKey) {
    throw new Error('TWITTERAPI_IO_KEY not configured');
  }

  const idStr = String(tweetId).trim();
  const url = `https://api.twitterapi.io/twitter/tweets?tweet_ids=${encodeURIComponent(idStr)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'X-API-Key': apiKey },
  });
  if (!response.ok) {
    throw new Error(`TwitterAPI.io request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const tweets = Array.isArray(data?.tweets) ? data.tweets : [];
  const tweet =
    tweets.find((item: unknown) => {
      const record = asRecord(item);
      return cleanString(record?.id) === idStr || cleanString(record?.id_str) === idStr;
    }) ?? tweets[0];
  if (!tweet || typeof tweet !== 'object') {
    throw new Error(`Tweet ${idStr} not found in API response`);
  }

  const t = tweet as Record<string, unknown>;
  const { userName, name } = authorFromTweetObj(t);
  const screenName =
    userName ||
    handleHint ||
    'unknown';
  const authorName = name || screenName;
  const media = extractTweetMediaUrls(t);
  const urls = extractEntityUrls(t);
  const engagement = extractTweetEngagement(t);
  const referencedPost = extractReferencedPostFromTweet(t);
  const postUrl = cleanString(t.url) || `https://x.com/${screenName}/status/${idStr}`;

  return {
    post_id: idStr,
    post_text: extractTweetBodyText(t),
    post_url: postUrl,
    posted_at:
      typeof t.createdAt === 'string'
        ? t.createdAt
        : typeof t.created_at === 'string'
          ? t.created_at
          : new Date().toISOString(),
    author_name: authorName,
    handle: screenName,
    ...(urls.length > 0 ? { urls } : {}),
    ...(media.length > 0 ? { media_urls: media } : {}),
    ...(engagement ? { social_engagement: engagement } : {}),
    ...(referencedPost ? { referencedPost } : {}),
    raw: t,
  };
}

function cleanId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function normalizeConversationTweet(
  tweet: unknown,
  handleHint?: string,
): XConversationPost | undefined {
  const t = asRecord(tweet);
  if (!t) return undefined;

  const id = cleanId(t.id) || cleanId(t.id_str) || cleanId(t.tweet_id) || cleanId(t.tweetId);
  if (!id) return undefined;

  const { userName, name } = authorFromTweetObj(t);
  const handle = userName || handleHint || cleanString(t.userName) || cleanString(t.screen_name) || 'unknown';
  const authorName = name || cleanString(t.name) || handle;
  const text = extractTweetBodyText(t);
  if (!text.trim()) return undefined;

  const inReplyToId =
    cleanId(t.in_reply_to_status_id_str) ||
    cleanId(t.in_reply_to_status_id) ||
    cleanId(t.inReplyToStatusId) ||
    cleanId(t.inReplyToTweetId) ||
    cleanId(t.in_reply_to_tweet_id);
  const media = extractTweetMediaUrls(t);
  const urls = extractEntityUrls(t);
  const referencedPost = extractReferencedPostFromTweet(t);
  const postUrl = cleanString(t.url) || `https://x.com/${handle}/status/${id}`;

  return {
    post_id: id,
    post_text: text,
    post_url: postUrl,
    posted_at:
      typeof t.createdAt === 'string'
        ? t.createdAt
        : typeof t.created_at === 'string'
          ? t.created_at
          : new Date().toISOString(),
    author_name: authorName,
    handle,
    ...(urls.length > 0 ? { urls } : {}),
    ...(media.length > 0 ? { media_urls: media } : {}),
    ...(inReplyToId ? { in_reply_to_id: inReplyToId } : {}),
    ...(referencedPost ? { referencedPost } : {}),
    raw: t,
  };
}

function collectTweetRecords(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!value) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectTweetRecords(item, out);
    return out;
  }

  const record = asRecord(value);
  if (!record) return out;

  const hasTweetShape =
    (cleanId(record.id) || cleanId(record.id_str) || cleanId(record.tweet_id) || cleanId(record.tweetId)) &&
    (cleanString(record.text) ||
      cleanString(record.full_text) ||
      cleanString(record.fullText) ||
      nestedString(record.note_tweet, ['text']) ||
      nestedString(record.noteTweet, ['text']));

  if (hasTweetShape) out.push(record);

  for (const key of ['tweets', 'replies', 'data', 'items', 'result', 'results', 'thread']) {
    if (key in record) collectTweetRecords(record[key], out);
  }

  return out;
}

function responseNextCursor(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  for (const key of ['next_cursor', 'nextCursor', 'cursor', 'next']) {
    const raw = record[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return responseNextCursor(record.data);
}

async function fetchTwitterApiJson(url: URL): Promise<unknown> {
  const apiKey = process.env.TWITTERAPI_IO_KEY;
  if (!apiKey) {
    throw new Error('TWITTERAPI_IO_KEY not configured');
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-API-Key': apiKey },
  });
  if (!response.ok) {
    throw new Error(`TwitterAPI.io request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function fetchTweetThreadContext(
  tweetId: string,
  options: { cursor?: string; handleHint?: string } = {},
): Promise<{ posts: XConversationPost[]; nextCursor?: string }> {
  const url = new URL('https://api.twitterapi.io/twitter/tweet/thread_context');
  url.searchParams.set('tweetId', String(tweetId).trim());
  if (options.cursor) url.searchParams.set('cursor', options.cursor);

  const data = await fetchTwitterApiJson(url);
  const posts = collectTweetRecords(data)
    .map((tweet) => normalizeConversationTweet(tweet, options.handleHint))
    .filter((tweet): tweet is XConversationPost => Boolean(tweet));

  return {
    posts,
    nextCursor: responseNextCursor(data),
  };
}

export async function fetchTweetRepliesV2(
  tweetId: string,
  options: { cursor?: string; sort?: 'Relevance' | 'Latest' | 'Likes'; handleHint?: string } = {},
): Promise<{ replies: XConversationPost[]; nextCursor?: string }> {
  const url = new URL('https://api.twitterapi.io/twitter/tweet/replies/v2');
  url.searchParams.set('tweetId', String(tweetId).trim());
  if (options.cursor) url.searchParams.set('cursor', options.cursor);
  if (options.sort) url.searchParams.set('sort', options.sort);

  const data = await fetchTwitterApiJson(url);
  const replies = collectTweetRecords(data)
    .map((tweet) => normalizeConversationTweet(tweet, options.handleHint))
    .filter((tweet): tweet is XConversationPost => Boolean(tweet));

  return {
    replies,
    nextCursor: responseNextCursor(data),
  };
}

export async function fetchPostsFromX(handle: string): Promise<XPost[]> {
  const apiKey = process.env.TWITTERAPI_IO_KEY;

  if (!apiKey) {
    throw new Error('TWITTERAPI_IO_KEY not configured');
  }

  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const mapped: XPost[] = []
    const maxPages = getFetchTweetPageLimit()
    const maxPosts = getFetchPostLimit()
    let cursor: string | undefined

    for (let page = 0; page < maxPages; page += 1) {
      const url = new URL('https://api.twitterapi.io/twitter/user/last_tweets')
      url.searchParams.set('userName', handle)
      if (cursor) url.searchParams.set('cursor', cursor)

      const response = await fetch(url.toString(), {
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

      if (!Array.isArray(tweets) || tweets.length === 0) {
        break;
      }

      let pageHadRecentPost = false
      for (const tweet of tweets as any[]) {
        try {
          const postedAt = new Date(tweet?.createdAt ?? tweet?.created_at ?? new Date())
          if (postedAt < oneMonthAgo) continue
          pageHadRecentPost = true

          const t = tweet as Record<string, unknown>
          const rawId = tweet?.id ?? tweet?.id_str
          const idStr =
            typeof rawId === 'string' || typeof rawId === 'number' ? String(rawId) : ''
          if (!idStr) continue

          const media = extractTweetMediaUrls(t)
          const urls = extractEntityUrls(t)
          const engagement = extractTweetEngagement(t)
          const referencedPost = extractReferencedPostFromTweet(t)
          mapped.push({
            post_id: idStr,
            post_text: extractTweetBodyText(t),
            post_url: `https://x.com/${handle}/status/${idStr}`,
            posted_at:
              typeof tweet?.createdAt === 'string'
                ? tweet.createdAt
                : typeof tweet?.created_at === 'string'
                  ? tweet.created_at
                  : new Date().toISOString(),
            ...(urls.length > 0 ? { urls } : {}),
            ...(media.length > 0 ? { media_urls: media } : {}),
            ...(engagement ? { social_engagement: engagement } : {}),
            ...(referencedPost ? { referencedPost } : {}),
          })
          if (maxPosts != null && mapped.length >= maxPosts) break
        } catch (rowErr) {
          console.warn(`[fetchPostsFromX] skip malformed tweet for @${handle}:`, rowErr)
        }
      }

      if (maxPosts != null && mapped.length >= maxPosts) break
      const nextCursor = cleanString(data?.next_cursor)
      const hasNextPage = data?.has_next_page === true || data?.has_next_page === 'true'
      if (!hasNextPage || !nextCursor || !pageHadRecentPost) break
      cursor = nextCursor
    }

    mapped.sort(
      (a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime()
    );

    return mapped;
  } catch (error) {
    console.error(`Error fetching posts from X for ${handle}:`, error);
    return [];
  }
}
