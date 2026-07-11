type SmokeTarget = {
  path: string;
  maxBytes?: number;
  validate?: (body: unknown) => void;
};

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  assertCondition(Boolean(value) && typeof value === "object", `${label} should be an object`);
}

async function smoke(target: SmokeTarget, baseUrl: string) {
  const url = new URL(target.path, baseUrl);
  const startedAt = Date.now();
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const elapsedMs = Date.now() - startedAt;
  const bytes = Buffer.byteLength(text);

  assertCondition(res.ok, `${target.path} returned HTTP ${res.status}`);
  if (target.maxBytes) {
    assertCondition(bytes <= target.maxBytes, `${target.path} exceeded ${target.maxBytes} bytes`);
  }

  if (target.validate) {
    target.validate(text ? JSON.parse(text) : null);
  }

  console.log(`${target.path} ok (${bytes} bytes, ${elapsedMs} ms)`);
}

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3001";

const targets: SmokeTarget[] = [
  { path: "/", maxBytes: 90_000 },
  {
    path: "/api/feed?offset=0&limit=12",
    maxBytes: 30_000,
    validate(body) {
      assertRecord(body, "/api/feed");
      assertCondition(Array.isArray(body.posts), "/api/feed posts should be an array");
      assertCondition(typeof body.total === "number", "/api/feed total should be a number");
      assertCondition(typeof body.nextOffset === "number", "/api/feed nextOffset should be a number");
      assertCondition(typeof body.hasMore === "boolean", "/api/feed hasMore should be a boolean");
    },
  },
  {
    path: "/api/longform/posts?offset=0&limit=12",
    maxBytes: 100_000,
    validate(body) {
      assertRecord(body, "/api/longform/posts");
      assertCondition(body.success === true, "/api/longform/posts success should be true");
      assertCondition(Array.isArray(body.posts), "/api/longform/posts posts should be an array");
      assertCondition(typeof body.total === "number", "/api/longform/posts total should be a number");
      assertCondition(
        typeof body.nextOffset === "number",
        "/api/longform/posts nextOffset should be a number"
      );
      assertCondition(
        typeof body.hasMore === "boolean",
        "/api/longform/posts hasMore should be a boolean"
      );
    },
  },
  {
    path: "/api/health/feed",
    validate(body) {
      assertRecord(body, "/api/health/feed");
      assertRecord(body.queue, "/api/health/feed queue");
      assertCondition(
        typeof body.rawQueuePending === "number",
        "/api/health/feed rawQueuePending should be a number"
      );
      assertCondition(
        typeof body.processingJobsPending === "number",
        "/api/health/feed processingJobsPending should be a number"
      );
    },
  },
  { path: "/api/recommended-sources?limit=6" },
];

async function main() {
  for (const target of targets) {
    await smoke(target, baseUrl);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
