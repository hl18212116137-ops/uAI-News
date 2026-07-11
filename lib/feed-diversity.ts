import type { NewsItem } from "@/lib/types";

function normalizeSourceKey(post: NewsItem): string {
  const source = post.source;
  const raw = typeof source === "string" ? source : source?.handle || source?.name || "";
  return String(raw).trim().replace(/^@+/, "").toLowerCase();
}

function trailingSourceStreak<T extends NewsItem>(items: T[], sourceKey: string): number {
  let count = 0;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (normalizeSourceKey(items[i]) !== sourceKey) break;
    count += 1;
  }
  return count;
}

export function diversifyNewsItemsBySource<T extends NewsItem>(
  items: T[],
  maxConsecutivePerSource = 2
): T[] {
  const maxConsecutive = Math.max(1, Math.floor(maxConsecutivePerSource));
  const remaining = [...items];
  const out: T[] = [];

  while (remaining.length > 0) {
    let pickIndex = 0;
    const firstSource = normalizeSourceKey(remaining[0]);
    if (
      firstSource &&
      out.length > 0 &&
      trailingSourceStreak(out, firstSource) >= maxConsecutive
    ) {
      const alternateIndex = remaining.findIndex(
        (item) => normalizeSourceKey(item) !== firstSource
      );
      if (alternateIndex >= 0) pickIndex = alternateIndex;
    }

    const [next] = remaining.splice(pickIndex, 1);
    out.push(next);
  }

  return out;
}
