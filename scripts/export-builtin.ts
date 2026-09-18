import { writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import type { GeneratedCourse } from "../src/lib/types";
import type { BuiltinBookCourse, BuiltinManualFlow } from "../src/lib/builtin-book-courses";

// book/ 下的 6 门业务课程（知识库 + 操作手册）：按 sourceName 从库里取最新完整版本固化
const SOURCE_NAMES = [
  "内置教材：线上保理业务知识库",
  "内置教材：信用证业务知识库",
  "内置教材：票据业务知识库",
  "内置教材：凭证业务知识库",
  "内置教材：订单融资业务知识库",
  "内置教材：经销商业务知识库",
];

async function main() {
  const items: BuiltinBookCourse[] = [];

  for (const sourceName of SOURCE_NAMES) {
    const course = await prisma.course.findFirst({
      where: { sourceType: "builtin", sourceName },
      orderBy: { createdAt: "desc" },
      include: {
        chapters: {
          orderBy: { order: "asc" },
          include: {
            cases: true,
            questions: { orderBy: { order: "asc" } },
          },
        },
        manualFlows: {
          orderBy: { order: "asc" },
          include: { steps: { orderBy: { order: "asc" } } },
        },
      },
    });
    if (!course) {
      console.warn(`⚠️ 找不到课程：${sourceName}，跳过`);
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

    const manualFlows: BuiltinManualFlow[] = course.manualFlows.map((flow) => ({
      title: flow.title,
      goal: flow.goal,
      md: flow.md,
      steps: flow.steps.map((step) => ({
        kind: step.kind || "step",
        actor: step.actor,
        title: step.title,
        detail: step.detail,
      })),
    }));

    items.push({
      sourceName,
      business: course.business || undefined,
      manualSourceName: course.manualSourceName || undefined,
      manualFlows: manualFlows.length ? manualFlows : undefined,
      data,
    });
    console.log(
      `✅ 导出：${course.title}（${course.chapters.length} 关 / ${manualFlows.length} 个实操流程）`,
    );
  }

  await prisma.$disconnect();

  const out = `import type { GeneratedCourse } from "./types";

/** 固化内置课程：一门业务 = 一门课程（知识库 → 学习宝典；操作手册 → 实操宝典） */
export type BuiltinManualStep = { kind: string; actor: string; title: string; detail: string };
export type BuiltinManualFlow = { title: string; goal: string; md: string; steps: BuiltinManualStep[] };

export type BuiltinBookCourse = {
  /** 用于 seed 幂等判断的稳定标识 */
  sourceName: string;
  /** 业务归属（一门业务 = 一门课程） */
  business?: string;
  /** 操作手册源文件名：实操宝典「下载这份文件」用 */
  manualSourceName?: string;
  /** 实操宝典流程（无手册的课程可省略） */
  manualFlows?: BuiltinManualFlow[];
  data: GeneratedCourse;
};

export const BUILTIN_BOOK_COURSES: BuiltinBookCourse[] = ${JSON.stringify(items, null, 2)};
`;

  const targetFile = path.join(process.cwd(), "src", "lib", "builtin-book-courses.ts");
  await writeFile(targetFile, out, "utf8");
  console.log(`\n已写入 ${targetFile}（${out.length} 字符）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
