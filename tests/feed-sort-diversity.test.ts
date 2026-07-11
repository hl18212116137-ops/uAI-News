import test from "node:test";
import assert from "node:assert/strict";
import { diversifyNewsItemsBySource } from "@/lib/feed-diversity";
import { compareNewsItemsForFeedDisplay } from "@/lib/feed-sort";
import { makeNewsItem, testSource } from "./test-helpers";

test("feed display sort prefers recently fetched items when requested", () => {
  const olderPublished = makeNewsItem({
    id: "recently-fetched",
    publishedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-03T00:00:00.000Z",
  });
  const newerPublished = makeNewsItem({
    id: "newer-published",
    publishedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-02T00:00:00.000Z",
  });

  const sorted = [newerPublished, olderPublished].sort((a, b) =>
    compareNewsItemsForFeedDisplay(a, b, {
      prioritizeRecentlyFetched: true,
      recentlyFetchedSinceMs: new Date("2026-01-02T12:00:00.000Z").getTime(),
    })
  );

  assert.equal(sorted[0].id, "recently-fetched");
});

test("source diversity prevents long same-source streaks when alternatives exist", () => {
  const items = [
    makeNewsItem({ id: "a1", source: { ...testSource, handle: "a" } }),
    makeNewsItem({ id: "a2", source: { ...testSource, handle: "a" } }),
    makeNewsItem({ id: "a3", source: { ...testSource, handle: "a" } }),
    makeNewsItem({ id: "b1", source: { ...testSource, handle: "b" } }),
  ];

  const diversified = diversifyNewsItemsBySource(items, 2);

  assert.deepEqual(
    diversified.map((item) => item.id),
    ["a1", "a2", "b1", "a3"]
  );
});
