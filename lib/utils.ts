/**
 * 将秒数格式化为中文时间字符串
 * @param seconds 秒数
 * @returns 格式化后的时间字符串，如 "3 分 20 秒"
 */
export function formatTime(seconds: number): string {
  if (seconds === 0) return '0 秒';
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) return `${minutes} 分`;
  return `${minutes} 分 ${secs} 秒`;
}

/**
 * 判断推文是否为"最新一批"抓取的
 * 只在抓取完成后的首次页面加载时显示"新"标签
 * 刷新页面后标签消失
 * @param createdAt 推文的导入时间
 * @returns boolean 是否为新推文
 */
export function isNewPost(createdAt: string): boolean {
  try {
    // 检查是否在浏览器环境
    if (typeof window === 'undefined') {
      return false;
    }

    // 获取最后一次抓取的时间戳
    const lastFetchTimestamp = sessionStorage.getItem('lastFetchTimestamp');
    const hasRefreshed = sessionStorage.getItem('hasRefreshed');

    if (!lastFetchTimestamp || hasRefreshed === 'true') {
      // 如果没有记录，或者已经刷新过，不显示"新"标签
      return false;
    }

    const lastFetchTime = parseInt(lastFetchTimestamp, 10);
    const postCreatedTime = new Date(createdAt).getTime();

    // 只有在最后一次抓取之后创建的推文才显示"新"标签
    return postCreatedTime >= lastFetchTime;
  } catch (error) {
    return false;
  }
}

/**
 * 自动修正中英文/数字之间的排版空格
 * @param text 原始文本
 * @returns 修正后的文本
 */
export function formatTypography(text: string): string {
  if (!text) return text;
  return text
    .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2');
}

/** 与 `LinkifiedParagraph` 中 URL 识别同构（不含捕获组，供 `RegExp` 拼接） */
const INSIGHT_ORIGINAL_URL_BODY = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/;

/**
 * INSIGHT ORIGINAL 译文/正文：压缩乱空格，并在 URL 与句读处插入换行，配合 `whitespace-pre-wrap` 可读性更好。
 */
export function formatOriginalInsightBody(text: string): string {
  if (!text) return text;
  let s = text.replace(/\r\n?/g, "\n").trim();
  s = s.replace(/[^\S\n]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/([^\s\n])(https?:\/\/)/gi, "$1\n$2");
  s = s.replace(
    new RegExp(
      `(${INSIGHT_ORIGINAL_URL_BODY.source})(?=[\\u4e00-\\u9fff\\u3000-\\u303f\\uff00-\\uffefA-Za-z「『（【])`,
      "gi",
    ),
    "$1\n",
  );
  s = s.replace(/([\u3002\uFF01\uFF1F\uFF1B。！？；])([^\s\n\u3002\uFF01\uFF1F\uFF1B。！？])/g, "$1\n$2");
  s = s.replace(/([.!?]) ([A-Z])/g, "$1\n$2");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

/** ORIGINAL 正文：少量 `**` 包裹，供 `BoldLinkifiedInline` 渲染；全书名/短引/编辑注，全篇合计不超过若干处以免刷屏 */
const ORIGINAL_INSIGHT_MAX_EMPHASIS = 6;

/**
 * 将常见「重点外壳」包成 markdown 粗体；与 `formatOriginalInsightBody` 顺序：先格式化再调用本函数。
 */
export function emphasizeOriginalInsightKeyPhrases(text: string): string {
  if (!text) return text;
  let used = 0;
  const cap = ORIGINAL_INSIGHT_MAX_EMPHASIS;
  const take = () => {
    if (used >= cap) return false;
    used += 1;
    return true;
  };
  let s = text.replace(/《([^》]{1,50})》/g, (_, inner: string) =>
    take() ? `**《${inner}》**` : `《${inner}》`,
  );
  s = s.replace(/「([^」]{2,35})」/g, (_, inner: string) =>
    take() ? `**「${inner}」**` : `「${inner}」`,
  );
  s = s.replace(/【([^】]{2,40})】/g, (_, inner: string) =>
    take() ? `**【${inner}】**` : `【${inner}】`,
  );
  return s;
}

/** 互动数紧凑展示（侧栏等） */
export function formatSocialCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}
