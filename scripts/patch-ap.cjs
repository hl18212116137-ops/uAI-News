const fs = require("fs");
const path = require("path");
const dir = __dirname;
function readPatch(name) {
  return fs
    .readFileSync(path.join(dir, name), "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .trimEnd() + "\n";
}
function repFile(file, oldName, newName) {
  let s = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const o = readPatch(oldName);
  const n = readPatch(newName);
  if (!s.includes(o.trimEnd())) {
    const ot = o.trimEnd();
    if (!s.includes(ot)) {
      console.error("Missing", file, oldName);
      process.exit(1);
    }
    s = s.replace(ot, n.trimEnd());
  } else {
    s = s.replace(o.trimEnd(), n.trimEnd());
  }
  fs.writeFileSync(file, s, "utf8");
}
const ap = path.join(dir, "..", "components", "AnalysisPanel.tsx");
repFile(ap, "patch-ap-old-split.txt", "patch-ap-new-split.txt");
repFile(ap, "patch-ap-old-ctx.txt", "patch-ap-new-ctx.txt");
repFile(ap, "patch-ap-old-comment.txt", "patch-ap-new-comment.txt");
repFile(ap, "patch-ap-old-kp.txt", "patch-ap-new-kp.txt");
repFile(ap, "patch-ap-old-relsec.txt", "patch-ap-new-relsec.txt");
console.log("AnalysisPanel ok");
