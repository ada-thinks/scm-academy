import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCourseFromUpload } from "../src/lib/course-service";
import { prisma } from "../src/lib/prisma";

const BOOK_DIR = path.join(process.cwd(), "book");
const FILES = [
  "保理业务知识库.pdf",
  "票据业务知识库.pdf",
  "信用证业务知识库.pdf",
];

async function main() {
  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) {
    throw new Error("找不到 admin 用户，请先跑 npm run db:seed");
  }

  for (const filename of FILES) {
    // 按业务名去重（sourceName 以"保理/票据/信用证"开头都算同名，兼容旧文件名带"（N页）"的情况）
    const keyword = filename.replace(/业务知识库\.pdf$/, "");
    const existing = await prisma.course.findFirst({
      where: { sourceType: "pdf", sourceName: { startsWith: keyword } },
    });
    if (existing) {
      console.log(`⚠️ 已存在同名课程，跳过：${existing.title} (${existing.id})`);
      continue;
    }

    const buffer = await readFile(path.join(BOOK_DIR, filename));
    console.log(`\n正在导入 ${filename} (${(buffer.length / 1024).toFixed(1)} KB)...`);

    const { course, usedAi } = await createCourseFromUpload({
      filename,
      buffer,
      userId: admin.id,
    });

    console.log(`✅ ${usedAi ? "AI" : "本地模板"}生成课程：${course.title} (${course.id})`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
