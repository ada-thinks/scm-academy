import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { SAMPLE_COURSE } from "./sample-course";
import { BUILTIN_BOOK_COURSES } from "./builtin-book-courses";
import { ACHIEVEMENTS } from "./gamification";
import type { GeneratedCourse } from "./types";
import type { ParsedManualFlow } from "./manual";

let seedPromise: Promise<void> | null = null;

async function persistCourse(
  data: GeneratedCourse,
  createdById?: string,
  sourceType = "sample",
  sourceName?: string,
) {
  return prisma.$transaction(async (tx) => {
    const course = await tx.course.create({
      data: {
        title: data.title,
        description: data.description,
        coverEmoji: data.coverEmoji,
        sourceType,
        sourceName,
        status: "ready",
        createdById,
      },
    });

    const chapterRows: { id: string; order: number }[] = [];
    for (const [index, chapter] of data.chapters.entries()) {
      const row = await tx.chapter.create({
        data: {
          courseId: course.id,
          order: index + 1,
          title: chapter.title,
          priority: chapter.priority || "",
          summary: chapter.summary,
          notesMd: chapter.notesMd,
          mindmapJson: JSON.stringify(chapter.mindmap),
          passScore: 60,
        },
      });
      chapterRows.push(row);
      for (const item of chapter.cases) {
        await tx.caseStudy.create({
          data: {
            chapterId: row.id,
            title: item.title,
            scene: item.scene,
            analysis: item.analysis,
          },
        });
      }
      for (const [qIndex, question] of chapter.questions.entries()) {
        const stem = String(question.stem || "").trim();
        if (!stem) continue;
        await tx.question.create({
          data: {
            chapterId: row.id,
            type: question.type || "single",
            stem,
            optionsJson: JSON.stringify(question.options?.length ? question.options : ["正确", "错误"]),
            answerJson: JSON.stringify(question.answer?.length ? question.answer : [0]),
            explanation: question.explanation || "",
            order: qIndex,
          },
        });
      }
    }

    const users = await tx.user.findMany({ select: { id: true } });
    const progressRows = users.flatMap((user) =>
      chapterRows.map((chapter) => ({
        userId: user.id,
        courseId: course.id,
        chapterId: chapter.id,
        status: chapter.order === 1 ? "unlocked" : "locked",
      })),
    );
    if (progressRows.length) {
      await tx.progress.createMany({ data: progressRows });
    }

    return course;
  }, { timeout: 30000 });
}

export async function replaceCourseContent(
  courseId: string,
  data: GeneratedCourse,
) {
  return prisma.$transaction(async (tx) => {
    await tx.chapter.deleteMany({ where: { courseId } });
    await tx.course.update({
      where: { id: courseId },
      data: {
        title: data.title,
        description: data.description,
        coverEmoji: data.coverEmoji,
        status: "ready",
      },
    });

    const chapterRows: { id: string; order: number }[] = [];
    for (const [index, chapter] of data.chapters.entries()) {
      const row = await tx.chapter.create({
        data: {
          courseId,
          order: index + 1,
          title: chapter.title,
          priority: chapter.priority || "",
          summary: chapter.summary,
          notesMd: chapter.notesMd,
          mindmapJson: JSON.stringify(chapter.mindmap),
          passScore: 60,
        },
      });
      chapterRows.push(row);
      for (const item of chapter.cases) {
        await tx.caseStudy.create({
          data: {
            chapterId: row.id,
            title: item.title,
            scene: item.scene,
            analysis: item.analysis,
          },
        });
      }
      for (const [qIndex, question] of chapter.questions.entries()) {
        const stem = String(question.stem || "").trim();
        if (!stem) continue;
        await tx.question.create({
          data: {
            chapterId: row.id,
            type: question.type || "single",
            stem,
            optionsJson: JSON.stringify(question.options?.length ? question.options : ["正确", "错误"]),
            answerJson: JSON.stringify(question.answer?.length ? question.answer : [0]),
            explanation: question.explanation || "",
            order: qIndex,
          },
        });
      }
    }

    const users = await tx.user.findMany({ select: { id: true } });
    const progressRows = users.flatMap((user) =>
      chapterRows.map((chapter) => ({
        userId: user.id,
        courseId,
        chapterId: chapter.id,
        status: chapter.order === 1 ? "unlocked" : "locked",
      })),
    );
    if (progressRows.length) {
      await tx.progress.createMany({ data: progressRows });
    }
    return tx.course.findUniqueOrThrow({ where: { id: courseId } });
  }, { timeout: 30000 });
}

/** 写入一门业务课程的实操流程：整体替换 manualFlows（不触碰学习宝典） */
export async function replaceManualFlows(courseId: string, flows: ParsedManualFlow[]) {
  await prisma.$transaction(
    async (tx) => {
      await tx.manualFlow.deleteMany({ where: { courseId } });
      for (const [index, flow] of flows.entries()) {
        await tx.manualFlow.create({
          data: {
            courseId,
            order: index + 1,
            title: flow.title,
            goal: flow.goal,
            md: flow.md,
            steps: {
              create: flow.steps.map((step, stepIndex) => ({
                order: stepIndex + 1,
                kind: step.kind || "step",
                actor: step.actor,
                title: step.title,
                detail: step.detail,
              })),
            },
          },
        });
      }
    },
    { timeout: 30000 },
  );
  // 事务提交后再统计，避免在事务内读到删除后的旧数量
  return prisma.manualFlow.count({ where: { courseId } });
}

async function runSeed() {
  for (const item of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        description: item.description,
        emoji: item.emoji,
        xpReward: item.xpReward,
      },
      create: item,
    });
  }

  const adminHash = await bcrypt.hash("admin123", 10);
  const learnerHash = await bcrypt.hash("learn123", 10);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      name: "林小链",
      username: "admin",
      passwordHash: adminHash,
      role: "admin",
      xp: 0,
    },
  });
  await prisma.user.upsert({
    where: { username: "zhang" },
    update: {},
    create: {
      name: "张采购",
      username: "zhang",
      passwordHash: learnerHash,
      role: "learner",
      xp: 80,
    },
  });
  await prisma.user.upsert({
    where: { username: "wang" },
    update: {},
    create: {
      name: "王仓管",
      username: "wang",
      passwordHash: learnerHash,
      role: "learner",
      xp: 40,
    },
  });

  const sample = await prisma.course.findFirst({ where: { sourceType: "sample" } });
  if (!sample) {
    const admin = await prisma.user.findUnique({ where: { username: "admin" } });
    await persistCourse(SAMPLE_COURSE, admin?.id, "sample", "内置示例：供应链入门");
  }

  // book/ 6 门业务课程固化出的内置课程（线上保理 / 信用证 / 票据 / 凭证 / 订单融资 / 经销商）
  const adminUser = await prisma.user.findUnique({ where: { username: "admin" } });
  for (const item of BUILTIN_BOOK_COURSES) {
    const exists = await prisma.course.findFirst({
      where: { sourceType: "builtin", sourceName: item.sourceName },
    });
    const course = exists ?? (await persistCourse(item.data, adminUser?.id, "builtin", item.sourceName));

    await prisma.course.update({
      where: { id: course.id },
      data: {
        business: item.business || course.business,
        manualSourceName: item.manualSourceName || course.manualSourceName,
        published: true,
      },
    });

    // 实操宝典：只在还没有流程时写入，避免覆盖管理员后续手工调整
    if (item.manualFlows?.length) {
      const flowCount = await prisma.manualFlow.count({ where: { courseId: course.id } });
      if (!flowCount) {
        await replaceManualFlows(course.id, item.manualFlows);
      }
    }
  }
}

export async function seedIfNeeded() {
  if (!seedPromise) {
    seedPromise = runSeed().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  await seedPromise;
}

export { persistCourse };
