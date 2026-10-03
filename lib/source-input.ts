const X_PROFILE_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com', 'mobile.x.com']);

/** Validate the host and handle before any external profile request. */
export function parseXProfileInput(input: string): { handle: string; url: string } {
  const value = input.trim();
  if (!value || value.length > 2048) throw new Error('请输入有效的信息源链接');
  const candidate = /^@?[A-Za-z0-9_]{1,15}$/.test(value)
    ? `https://x.com/${value.replace(/^@/, '')}`
    : /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try { url = new URL(candidate); } catch { throw new Error('请输入有效的信息源链接'); }
  if (!['https:', 'http:'].includes(url.protocol) || !X_PROFILE_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || url.port) {
    throw new Error('目前仅支持 X / Twitter 信息源链接');
  }
  const handle = url.pathname.split('/').filter(Boolean)[0]?.replace(/^@/, '');
  if (!handle || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error('无法从链接识别有效用户名');
  return { handle, url: `https://x.com/${handle}` };
}
