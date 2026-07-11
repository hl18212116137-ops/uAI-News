import test from "node:test";
import assert from "node:assert/strict";
import {
  isUsableLongformArticle,
  isVideoTranscriptRequiredLongformUrl,
} from "@/lib/longform-quality";
import { makeLongformArticle } from "./test-helpers";

test("CNBC video pages require transcript-based discovery", () => {
  assert.equal(
    isVideoTranscriptRequiredLongformUrl("https://www.cnbc.com/video/2026/01/01/example.html"),
    true
  );
  assert.equal(
    isUsableLongformArticle(
      makeLongformArticle({
        url: "https://www.cnbc.com/video/2026/01/01/example.html",
        resolvedUrl: "https://www.cnbc.com/video/2026/01/01/example.html",
        discoveryMethod: "url",
      })
    ),
    false
  );
});

test("transcript longform and normal article longform remain usable", () => {
  assert.equal(
    isUsableLongformArticle(
      makeLongformArticle({
        url: "https://www.cnbc.com/video/2026/01/01/example.html",
        resolvedUrl: "https://www.cnbc.com/video/2026/01/01/example.html",
        discoveryMethod: "video-transcript",
      })
    ),
    true
  );
  assert.equal(isUsableLongformArticle(makeLongformArticle()), true);
  assert.equal(
    isUsableLongformArticle(makeLongformArticle({ translatedContent: "" })),
    false
  );
});
