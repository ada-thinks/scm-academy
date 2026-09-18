/**
 * 回填：把 PDF 教材章节标题里标注的优先级（P1/P2/P3）写入已生成的课程章节。
 * 依据：章节生成顺序 = 源文本一级标题顺序（splitByTopChapters）。
 */
import { prisma } from "../src/lib/prisma";
import { loadSource } from "../src/lib/source-store";
import { splitByTopChapters } from "../src/lib/teach";

async function main() {
  const courses = await prisma.course.findMany({
    include: { chapters: { orderBy: { order: "asc" }, select: { id: true, order: true, title: true } } },
  });
  let updatedCourses = 0;
  let updatedChapters = 0;
  for (const c of courses) {
    const source = await loadSource(c.id);
    if (!source) continue;
    const parts = splitByTopChapters(source);
    if (parts.length !== c.chapters.length || !parts.some((p) => p.priority)) {
      console.log(`跳过（章节数或优先级不匹配）: ${c.title} parts=${parts.length} chapters=${c.chapters.length}`);
      continue;
    }
    for (let i = 0; i < c.chapters.length; i++) {
      const p = parts[i].priority;
      if (p) {
        await prisma.chapter.update({ where: { id: c.chapters[i].id }, data: { priority: p } });
        console.log(`  ${c.title} · ${c.chapters[i].title} → ${p}`);
        updatedChapters++;
      }
    }
    updatedCourses++;
  }
  console.log(`\n完成：更新 ${updatedCourses} 门课程 / ${updatedChapters} 个章节`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
