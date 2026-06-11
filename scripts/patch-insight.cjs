const fs = require("fs");
const path = require("path");
const dir = __dirname;
function readPatch(name) {
  return fs
    .readFileSync(path.join(dir, name), "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .trimEnd();
}
function repFile(file, oldName, newName) {
  let s = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const o = readPatch(oldName);
  const n = readPatch(newName);
  if (!s.includes(o)) {
    console.error("Missing fragment", file, oldName);
    process.exit(1);
  }
  s = s.replace(o, n);
  fs.writeFileSync(file, s, "utf8");
}
const claude = path.join(dir, "..", "lib", "ai", "claude-service.ts");
repFile(claude, "patch-old-src.txt", "patch-new-src.txt");
repFile(claude, "patch-old-hl.txt", "patch-new-hl.txt");
repFile(claude, "patch-old-rel.txt", "patch-new-rel.txt");
repFile(claude, "patch-old-json.txt", "patch-new-json.txt");
repFile(claude, "patch-old-rel-parser.txt", "patch-new-rel-parser.txt");
console.log("claude ok");
const c = fs.readFileSync(claude, "utf8").replace(/\r\n/g, "\n");
const start = c.indexOf(`  /**
   * 分析推文（Phase 2 新增）`);
const li = c.lastIndexOf(`\n  }\n}\n`);
if (start < 0 || li < 0) {
  console.error("claude bounds", start, li);
  process.exit(1);
}
let method = c.slice(start, li + `\n  }\n`.length);
method = method.replace(/Claude analyzePost error/g, "MiniMax analyzePost error");
const minimax = path.join(dir, "..", "lib", "ai", "minimax-service.ts");
let m = fs.readFileSync(minimax, "utf8").replace(/\r\n/g, "\n");
const importOld = "import { AIService, AIProcessedContent } from './ai-service';";
const importNew =
  "import { AIService, AIProcessedContent, PostInsightContext } from './ai-service';\nimport { DEFAULT_INSIGHT_PERSONA } from '../insight-defaults';";
if (!m.includes(importOld)) {
  console.error("minimax import missing");
  process.exit(1);
}
m = m.replace(importOld, importNew);
const ms = m.indexOf(`  /**
   * 分析推文（Phase 2 新增）`);
const mli = m.lastIndexOf(`\n  }\n}\n`);
if (ms < 0 || mli < 0) {
  console.error("minimax bounds", ms, mli);
  process.exit(1);
}
const oldStub = m.slice(ms, mli + `\n  }\n`.length);
m = m.replace(oldStub, method);
fs.writeFileSync(minimax, m, "utf8");
console.log("minimax ok");
