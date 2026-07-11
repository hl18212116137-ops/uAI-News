import type { NewsItem, XReferencedPost } from "@/lib/types";
import {
  canonicalizeExternalUrlForDedupe,
  canonicalizeNewsSourceUrl,
  extractXStatusIdFromPostId,
  parseXStatusUrl,
} from "@/lib/news-post-url";

const MIN_CONTENT_FINGERPRINT_LENGTH = 32;
const EVENT_DEDUPE_WINDOW_HOURS = 72;
const EVENT_DEDUPE_WINDOW_MS = EVENT_DEDUPE_WINDOW_HOURS * 60 * 60 * 1000;

const EVENT_TOKEN_STOP_WORDS = new Set([
  "a",
  "about",
  "ai",
  "amp",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "co",
  "com",
  "for",
  "from",
  "has",
  "have",
  "http",
  "https",
  "in",
  "is",
  "it",
  "its",
  "model",
  "models",
  "new",
  "news",
  "now",
  "of",
  "on",
  "open",
  "our",
  "out",
  "over",
  "source",
  "that",
  "the",
  "their",
  "this",
  "to",
  "up",
  "use",
  "used",
  "using",
  "via",
  "was",
  "were",
  "will",
  "with",
  "www",
  "x",
]);

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function decodeCommonEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'");
}

export function normalizeNewsDedupeId(id: unknown): string {
  const raw = String(id ?? "").trim();
  if (!raw) return "";
  const xStatusId = extractXStatusIdFromPostId(raw);
  if (xStatusId) return `x-${xStatusId}`;
  return raw.replace(/^x_/, "x-");
}

export function canonicalNewsIdForPlatform(platform: unknown, externalId: unknown): string {
  const provider = String(platform ?? "").trim().toLowerCase();
  const raw = String(externalId ?? "").trim();
  if (!raw) return "";

  if (provider === "x" || provider === "twitter") {
    const statusId = extractXStatusIdFromPostId(raw) ?? raw.replace(/^x[-_]/i, "");
    return /^\d{5,}$/.test(statusId) ? `x-${statusId}` : normalizeNewsDedupeId(raw);
  }

  const prefix = provider || "item";
  const existingPrefix = raw.toLowerCase().startsWith(`${prefix}-`);
  return normalizeNewsDedupeId(existingPrefix ? raw : `${prefix}-${raw}`);
}

export function canonicalNewsIdForRawPost(rawPost: Record<string, unknown>): string {
  const platform = rawPost.platform ?? "X";
  const url = typeof rawPost.url === "string" ? rawPost.url : "";
  const parsed = url ? parseXStatusUrl(url) : null;
  if (parsed) return canonicalNewsIdForPlatform("X", parsed.statusId);

  const provider = String(platform ?? "").trim().toLowerCase();
  if (provider === "x" || provider === "twitter") {
    return canonicalNewsIdForPlatform("X", rawPost.id);
  }

  return normalizeNewsDedupeId(rawPost.id);
}

export function normalizeTextForDedupe(text: unknown): string {
  return decodeCommonEntities(String(text ?? ""))
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^RT\s+@\w+:\s*/i, "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bpic\.twitter\.com\/\S+/gi, " ")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function contentFingerprintFromParts(parts: unknown[]): string {
  const normalized = normalizeTextForDedupe(parts.filter(Boolean).join("\n"));
  if (normalized.length < MIN_CONTENT_FINGERPRINT_LENGTH) return "";
  return stableHash(normalized);
}

function referencedText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const text = (value as Partial<XReferencedPost>).text;
  return typeof text === "string" ? text : "";
}

function referencedId(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const id = (value as Partial<XReferencedPost>).id;
  return typeof id === "string" ? normalizeNewsDedupeId(id) : "";
}

function normalizeEventText(text: unknown): string {
  return normalizeTextForDedupe(text)
    .replace(/\bhugging\s+face\b/g, "huggingface")
    .replace(/\bmini\s*max\b/g, "minimax")
    .replace(/\bopen\s+ai\b/g, "openai");
}

function addEventToken(tokens: Set<string>, raw: string): void {
  const token = raw
    .trim()
    .replace(/^@+/, "")
    .replace(/^[^a-z0-9]+|[^a-z0-9%+-]+$/g, "");

  if (!token || token.length < 2 || EVENT_TOKEN_STOP_WORDS.has(token)) return;
  if (/^\d+$/.test(token) && token.length < 3) return;
  tokens.add(token);
}

function eventTokenSetFromParts(parts: unknown[]): Set<string> {
  const text = normalizeEventText(parts.filter(Boolean).join("\n"));
  const tokens = new Set<string>();
  const tokenPattern = /[a-z][a-z0-9_+-]{1,}|\d+(?:\.\d+)?\s*(?:b|m|k|%)?/g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) != null) {
    const raw = match[0].replace(/\s+/g, "");
    addEventToken(tokens, raw);
    if (raw.includes("_")) {
      for (const part of raw.split("_")) addEventToken(tokens, part);
    }
  }

  return tokens;
}

function newsItemEventTokens(item: NewsItem): Set<string> {
  return eventTokenSetFromParts([
    item.title,
    item.summary,
    item.content,
    item.originalText,
    item.referencedPost?.text,
    item.referencedPost?.userName,
    item.referencedPost?.name,
  ]);
}

function publishedTimeMs(value: string): number | null {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isWithinEventWindow(a: NewsItem, b: NewsItem): boolean {
  const aTime = publishedTimeMs(a.publishedAt);
  const bTime = publishedTimeMs(b.publishedAt);
  if (aTime == null || bTime == null) return true;
  return Math.abs(aTime - bTime) <= EVENT_DEDUPE_WINDOW_MS;
}

function setsIntersect(a: string[], b: string[]): boolean {
  const bSet = new Set(b);
  return a.some((key) => bSet.has(key));
}

function tokenOverlapScore(a: Set<string>, b: Set<string>) {
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared++;
  }
  const minSize = Math.min(a.size, b.size);
  const unionSize = a.size + b.size - shared;
  return {
    shared,
    containment: minSize > 0 ? shared / minSize : 0,
    jaccard: unionSize > 0 ? shared / unionSize : 0,
  };
}

function eventTokensAreDuplicate(a: Set<string>, b: Set<string>): boolean {
  const score = tokenOverlapScore(a, b);
  return (
    (score.shared >= 3 && score.containment >= 0.6 && score.jaccard >= 0.25) ||
    (score.shared >= 4 && score.containment >= 0.45 && score.jaccard >= 0.18) ||
    (score.shared >= 5 && score.containment >= 0.35)
  );
}

export function rawPostContentFingerprint(rawPost: Record<string, unknown>): string {
  return contentFingerprintFromParts([
    rawPost.text,
    rawPost.content,
    rawPost.title,
    referencedText(rawPost.referenced_post ?? rawPost.referencedPost),
  ]);
}

export function newsItemContentFingerprint(item: NewsItem): string {
  return contentFingerprintFromParts([
    item.originalText,
    item.referencedPost?.text,
    item.content,
    item.summary,
    item.title,
  ]);
}

export function newsItemDedupeKeys(item: NewsItem): string[] {
  const keys: string[] = [];
  const id = normalizeNewsDedupeId(item.id);
  if (id) keys.push(`id:${id}`);

  const url = canonicalizeNewsSourceUrl(item);
  if (url) keys.push(`url:${url}`);

  const refId = item.referencedPost?.id;
  if (refId) {
    keys.push(`ref:${normalizeNewsDedupeId(refId)}`);
  }

  const contentHash = newsItemContentFingerprint(item);
  if (contentHash) keys.push(`text:${contentHash}`);

  return keys;
}

export function rawPostDedupeKeys(rawPost: Record<string, unknown>): string[] {
  const keys: string[] = [];
  const id = canonicalNewsIdForRawPost(rawPost);
  if (id) keys.push(`id:${id}`);

  const url = canonicalizeExternalUrlForDedupe(String(rawPost.url ?? ""));
  if (url) keys.push(`url:${url}`);

  const refId = referencedId(rawPost.referenced_post ?? rawPost.referencedPost);
  if (refId) keys.push(`ref:${refId}`);

  const contentHash =
    typeof rawPost.content_hash === "string" && rawPost.content_hash.trim()
      ? rawPost.content_hash.trim()
      : rawPostContentFingerprint(rawPost);
  if (contentHash) keys.push(`text:${contentHash}`);

  return keys;
}

export function areNewsItemsNearDuplicate(a: NewsItem, b: NewsItem): boolean {
  const aKeys = newsItemDedupeKeys(a);
  const bKeys = newsItemDedupeKeys(b);
  if (setsIntersect(aKeys, bKeys)) return true;
  if (!isWithinEventWindow(a, b)) return false;
  return eventTokensAreDuplicate(newsItemEventTokens(a), newsItemEventTokens(b));
}

export function dedupeNewsItemsForDisplay<T extends NewsItem>(items: T[]): T[] {
  const seenKeys = new Set<string>();
  const out: T[] = [];

  for (const item of items) {
    const keys = newsItemDedupeKeys(item);
    if (keys.some((key) => seenKeys.has(key))) continue;
    if (out.some((existing) => areNewsItemsNearDuplicate(existing, item))) continue;
    out.push(item);
    for (const key of keys) seenKeys.add(key);
  }

  return out;
}
