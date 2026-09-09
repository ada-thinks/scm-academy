import { writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import type { GeneratedCourse } from "../src/lib/types";

// 从 book/ 三本 PDF 固化出的内置课程（取当前库中最新的完整版本）
const TARGETS: { courseId: string; sourceName: string }[] = [
  { courseId: "cmtqyi1rl0001fbeslbdtkr1t", sourceName: "内置教材：保理业务知识库" },
  { courseId: "cmtqynj7e003ffbesi9avx7lv", sourceName: "内置教材：票据业务知识库" },
  { courseId: "cmtqyus4j0001fbz0o810i0ih", sourceName: "内置教材：信用证业务知识库" },
];

async function main() {
  const items: { sourceName: string; data: GeneratedCourse }[] = [];
  for (const target of TARGETS) {
    const course = await prisma.course.findUnique({
      where: { id: target.courseId },
      include: {
        chapters: {
          orderBy: { order: "asc" },
          include: {
            cases: true,
            questions: { orderBy: { order: "asc" } },
          },
        },
      },
    });
    if (!course) {
      console.warn(`⚠️ 找不到课程 ${target.courseId}，跳过`);
      continue;
    }
    const data: GeneratedCourse = {
      title: course.title,
      description: course.description,
      coverEmoji: course.coverEmoji || "📦",
      chapters: course.chapters.map((ch) => ({
        title: ch.title,
        summary: ch.summary,
        notesMd: ch.notesMd,
        mindmap: JSON.parse(ch.mindmapJson || "{}"),
        cases: ch.cases.map((c) => ({ title: c.title, scene: c.scene, analysis: c.analysis })),
        questions: ch.questions.map((q) => ({
          type: (q.type || "single") as "single" | "multi" | "judge",
          stem: q.stem,
          options: JSON.parse(q.optionsJson || "[]") as string[],
          answer: JSON.parse(q.answerJson || "[0]") as number[],
          explanation: q.explanation || "",
        })),
      })),
    };
    items.push({ sourceName: target.sourceName, data });
    console.log(`✅ 导出：${course.title} (${course.chapters.length} 章)`);
  }
  await prisma.$disconnect();

  const out = `import type { GeneratedCourse } from "./types";

export type BuiltinBookCourse = {
  /** 用于 seed 幂等判断的稳定标识 */
  sourceName: string;
  data: GeneratedCourse;
};

export const BUILTIN_BOOK_COURSES: BuiltinBookCourse[] = ${JSON.stringify(items, null, 2)};
`;

  const targetFile = path.join(process.cwd(), "src", "lib", "builtin-book-courses.ts");
  await writeFile(targetFile, out, "utf8");
  console.log(`\n已写入 ${targetFile} (${out.length} chars)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
