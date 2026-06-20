const TITLE_URL_RE =
  /\b(?:https?:\/\/|www\.)[^\s<>"'`)\]}]+|\b(?:t\.co|x\.com|twitter\.com)\/[^\s<>"'`)\]}]+/gi;

const TITLE_LABEL_RE = /^(?:title|标题)\s*[:：]\s*/i;
const LEADING_REPOST_RE = /^(?:RT|QT|转发|转推|Repost)\s*[:：]?\s*/i;
const LEADING_HANDLE_RE = /^(?:@[A-Za-z0-9_]{1,30}|@[^\s:：]{1,40})\s*[:：]?\s*/;
const EMPTY_MARKDOWN_LINK_RE = /\[([^\]]+)\]\(\s*\)/g;
const EMPTY_BRACKETS_RE = /(?:\(\s*\)|（\s*）|\[\s*\]|【\s*】)/g;

function trimTitleEdges(text: string): string {
  return text
    .replace(/^[\s"'“”‘’「」『』:：,，;；\-–—|/\\]+/, "")
    .replace(/[\s"'“”‘’「」『』:：,，;；\-–—|/\\]+$/, "")
    .trim();
}

function stripLeadingSocialNoise(text: string): string {
  let value = text;

  for (let i = 0; i < 6; i += 1) {
    const previous = value;
    value = trimTitleEdges(value)
      .replace(TITLE_LABEL_RE, "")
      .replace(LEADING_REPOST_RE, "")
      .replace(LEADING_HANDLE_RE, "");

    if (value === previous) break;
  }

  return trimTitleEdges(value);
}

export function cleanNewsTitle(title: string, fallback = "未命名新闻"): string {
  const original = title.trim();
  if (!original) return fallback;

  const cleaned = stripLeadingSocialNoise(
    original
      .replace(/\r\n?/g, "\n")
      .replace(TITLE_URL_RE, " ")
      .replace(EMPTY_MARKDOWN_LINK_RE, "$1")
      .replace(EMPTY_BRACKETS_RE, " ")
      .replace(/\s+/g, " ")
  );

  return cleaned || fallback;
}
