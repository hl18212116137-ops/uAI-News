import { appendFile, mkdir } from "fs/promises";
import path from "path";

/** 开发态：把调试 NDJSON 写入 .cursor/debug-13e978.log（ingest 未落盘时的兜底） */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const text = await req.text();
    const dir = path.join(process.cwd(), ".cursor");
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, "debug-13e978.log"), text.trimEnd() + "\n");
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 500 });
  }
}
