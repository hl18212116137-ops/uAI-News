import test from "node:test";
import assert from "node:assert/strict";
import { dedupeNewsItemsForDisplay } from "@/lib/news-dedupe";
import {
  RAW_POST_PROCESSABLE_STATUSES,
  RAW_POST_PROCESSABLE_STATUS_VALUES,
  isRawPostProcessableStatus,
  normalizeRequestedRawIds,
} from "@/lib/raw-post-queue";
import { makeNewsItem } from "./test-helpers";

test("display dedupe keeps one item for the same canonical content", () => {
  const original = makeNewsItem({
    id: "x-1",
    title: "Same news",
    content: "OpenAI launched a new model today.",
    originalText: "OpenAI launched a new model today.",
  });
  const duplicate = makeNewsItem({
    id: "x-2",
    title: "Same news",
    content: "OpenAI launched a new model today.",
    originalText: "OpenAI launched a new model today.",
  });

  const deduped = dedupeNewsItemsForDisplay([original, duplicate]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, "x-1");
});

test("raw queue processable statuses are explicit and reusable", () => {
  assert.deepEqual(RAW_POST_PROCESSABLE_STATUSES, ["new", "queued"]);
  assert.deepEqual(RAW_POST_PROCESSABLE_STATUS_VALUES, ["new", "queued"]);
  assert.equal(isRawPostProcessableStatus("new"), true);
  assert.equal(isRawPostProcessableStatus("queued"), true);
  assert.equal(isRawPostProcessableStatus("processed"), false);
  assert.equal(isRawPostProcessableStatus("failed"), false);
});

test("an explicit refresh batch stays separate from the historical raw queue", () => {
  assert.equal(normalizeRequestedRawIds(undefined), null);
  assert.deepEqual(normalizeRequestedRawIds([]), []);
  assert.deepEqual(
    normalizeRequestedRawIds([" new-2 ", "new-1", "new-2", ""]),
    ["new-2", "new-1"]
  );
});
