import test from "node:test";
import assert from "node:assert/strict";
import {
  LONGFORM_FEED_PAGE_SIZE,
  clampFeedPageLimit,
  clampFeedPageOffset,
  makeFeedPage,
} from "@/lib/feed-pagination";
import { makeNewsItem } from "./test-helpers";

test("clamps feed pagination inputs to stable bounds", () => {
  assert.equal(LONGFORM_FEED_PAGE_SIZE, 12);
  assert.equal(clampFeedPageLimit(undefined, LONGFORM_FEED_PAGE_SIZE), 12);
  assert.equal(clampFeedPageLimit(0), 1);
  assert.equal(clampFeedPageLimit(99), 40);
  assert.equal(clampFeedPageOffset(-10), 0);
  assert.equal(clampFeedPageOffset("8.9"), 8);
});

test("makeFeedPage returns page metadata and list-safe previews", () => {
  const posts = Array.from({ length: 15 }, (_, index) =>
    makeNewsItem({
      id: `post-${index + 1}`,
      content: `${"x".repeat(500)} ${index}`,
      originalText: "o".repeat(250),
    })
  );

  const page = makeFeedPage(posts, 12, 12);

  assert.equal(page.posts.length, 3);
  assert.equal(page.total, 15);
  assert.equal(page.nextOffset, 15);
  assert.equal(page.hasMore, false);
  assert.equal(page.posts[0].id, "post-13");
  assert.ok(page.posts[0].content.length <= 420);
  assert.ok(page.posts[0].content.endsWith("...") || page.posts[0].content.endsWith("…"));
});
