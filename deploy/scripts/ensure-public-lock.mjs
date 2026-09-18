import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const lockPath = join(process.cwd(), "package-lock.json");
let text = readFileSync(lockPath, "utf8");
if (!text.includes("nexus.linklogis.cn")) {
  process.exit(0);
}
text = text.replaceAll(
  "http://nexus.linklogis.cn/repository/lls-npm/",
  "https://registry.npmjs.org/",
);
writeFileSync(lockPath, text);
console.log("==> package-lock 已切换为 registry.npmjs.org（仅本地文件，请自行决定是否提交）");
