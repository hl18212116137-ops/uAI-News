import { getDefaultAIService } from './ai/ai-factory';

interface XPost {
  post_id: string;
  post_text: string;
  post_url: string;
  posted_at: string;
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

    // 过滤并映射推文，只保留最近1个月的
    return tweets
      .filter((tweet: any) => {
        const postedAt = new Date(tweet.createdAt ?? tweet.created_at ?? new Date());
        return postedAt >= oneMonthAgo;
      })
      .map((tweet: any) => ({
        post_id: String(tweet.id),
        post_text: tweet.text ?? '',
        post_url: `https://x.com/${handle}/status/${tweet.id}`,
        posted_at: tweet.createdAt ?? tweet.created_at ?? new Date().toISOString(),
      }));
  } catch (error) {
    console.error(`Error fetching posts from X for ${handle}:`, error);
    return [];
  }
}