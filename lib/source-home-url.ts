import { normalizeSourceHandle } from "@/lib/source-avatar";

export function resolveSourceHomeUrl(source: {
  url?: string | null;
  handle?: string | null;
  platform?: string | null;
}): string {
  const rawUrl = source.url?.trim();
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return parsed.toString();
      }
    } catch {
      // Fall back to a handle-derived profile URL below.
    }
  }

  const handle = normalizeSourceHandle(source.handle);
  if (!handle) return "";

  const platform = source.platform?.trim().toLowerCase();
  if (!platform || platform === "x" || platform === "twitter") {
    return `https://x.com/${encodeURIComponent(handle)}`;
  }

  return "";
}
