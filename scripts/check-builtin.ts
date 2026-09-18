/** 检查内置课程是否有「兜底模板」关卡（AI 生成失败的痕迹），用于决定重建范围 */
import { prisma } from "../src/lib/prisma";

const FALLBACK_MARK = "是教材中的一个章节，下面按";

async function main() {
  const courses = await prisma.course.findMany({
    where: { sourceType: "builtin" },
    include: { chapters: { orderBy: { order: "asc" } }, manualFlows: true },
    orderBy: { createdAt: "asc" },
  });

  for (const c of courses) {
    const bad = c.chapters.filter((ch) => ch.notesMd.includes(FALLBACK_MARK));
    console.log(
      `${c.title}｜${c.chapters.length} 关 / ${c.manualFlows.length} 流程｜兜底关卡 ${bad.length}${
        bad.length ? ` → ${bad.map((b) => b.title).join("、")}` : ""
      }`,
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
