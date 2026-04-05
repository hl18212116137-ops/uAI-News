/** 注册成功后「打开网页邮箱」：按域名匹配 + 常用入口列表 */

export type WebmailEntry = {
  label: string;
  url: string;
};

const DOMAIN_TO_WEBMAIL: Record<string, WebmailEntry> = {
  "gmail.com": { label: "Gmail", url: "https://mail.google.com" },
  "googlemail.com": { label: "Gmail", url: "https://mail.google.com" },
  "outlook.com": { label: "Outlook", url: "https://outlook.live.com/mail/" },
  "hotmail.com": { label: "Outlook", url: "https://outlook.live.com/mail/" },
  "live.com": { label: "Outlook", url: "https://outlook.live.com/mail/" },
  "msn.com": { label: "Outlook", url: "https://outlook.live.com/mail/" },
  "yahoo.com": { label: "Yahoo Mail", url: "https://mail.yahoo.com" },
  "yahoo.co.jp": { label: "Yahoo Mail", url: "https://mail.yahoo.co.jp" },
  "icloud.com": { label: "iCloud 邮件", url: "https://www.icloud.com/mail" },
  "me.com": { label: "iCloud 邮件", url: "https://www.icloud.com/mail" },
  "mac.com": { label: "iCloud 邮件", url: "https://www.icloud.com/mail" },
  "qq.com": { label: "QQ 邮箱", url: "https://mail.qq.com" },
  "foxmail.com": { label: "QQ 邮箱", url: "https://mail.qq.com" },
  "vip.qq.com": { label: "QQ 邮箱", url: "https://mail.qq.com" },
  "163.com": { label: "163 邮箱", url: "https://mail.163.com" },
  "126.com": { label: "126 邮箱", url: "https://mail.126.com" },
  "yeah.net": { label: "网易邮箱", url: "https://mail.yeah.net" },
  "sina.com": { label: "新浪邮箱", url: "https://mail.sina.com.cn" },
  "sina.cn": { label: "新浪邮箱", url: "https://mail.sina.com.cn" },
  "sohu.com": { label: "搜狐邮箱", url: "https://mail.sohu.com" },
  "aliyun.com": { label: "阿里邮箱", url: "https://mail.aliyun.com" },
  "proton.me": { label: "Proton Mail", url: "https://mail.proton.me" },
  "protonmail.com": { label: "Proton Mail", url: "https://mail.proton.me" },
  "pm.me": { label: "Proton Mail", url: "https://mail.proton.me" },
};

/** 常用网页邮箱（用于企业邮等无法识别时的快捷入口） */
export const COMMON_WEBMAIL_QUICK: WebmailEntry[] = [
  { label: "Gmail", url: "https://mail.google.com" },
  { label: "Outlook", url: "https://outlook.live.com/mail/" },
  { label: "QQ 邮箱", url: "https://mail.qq.com" },
  { label: "163 邮箱", url: "https://mail.163.com" },
];

export function webmailForEmail(email: string): WebmailEntry | null {
  const part = email.split("@")[1];
  if (!part) return null;
  const domain = part.toLowerCase().trim();
  return DOMAIN_TO_WEBMAIL[domain] ?? null;
}
