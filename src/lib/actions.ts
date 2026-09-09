"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { clearSessionCookie, requireAdmin, requireUser, setSessionCookie } from "./auth";
import {
  grantAchievements,
  startRebuildGeneration,
  startUploadGeneration,
  unlockNextChapter,
  type CoursePurpose,
} from "./course-service";
import { buildCasePack, normalizePack } from "./case-engine";
import { BIZ_OPTIONS } from "./case-types";
import type { BizType, CaseEngineParams, CasePack } from "./case-types";
import { starsFromScore, xpFromResult } from "./gamification";
import { seedIfNeeded } from "./seed";
import { deleteManualSource, deleteSource } from "./source-store";

export async function loginAction(formData: FormData) {
  await seedIfNeeded();
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "账号或密码不对" };
  }
  await setSessionCookie({
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role as "admin" | "learner",
    xp: user.xp,
  });
  redirect("/home");
}

export async function registerAction(formData: FormData) {
  await seedIfNeeded();
  const name = String(formData.get("name") || "").trim();
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  if (!name || !username || password.length < 6) {
    return { error: "请填写昵称、账号，密码至少 6 位" };
  }
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return { error: "这个账号已经被占用" };
  const count = await prisma.user.count();
  const user = await prisma.user.create({
    data: {
      name,
      username,
      passwordHash: await bcrypt.hash(password, 10),
      role: count === 0 ? "admin" : "learner",
    },
  });
  const chapters = await prisma.chapter.findMany();
  if (chapters.length) {
    await prisma.progress.createMany({
      data: chapters.map((chapter) => ({
        userId: user.id,
        courseId: chapter.courseId,
        chapterId: chapter.id,
        status: chapter.order === 1 ? "unlocked" : "locked",
      })),
    });
  }
  await setSessionCookie({
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role as "admin" | "learner",
    xp: 0,
  });
  redirect("/home");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/");
}

export async function uploadCourseAction(formData: FormData) {
  const user = await requireAdmin();
  if (!user) return { error: "只有管理员可以上传教材或手册" };
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) {
    return { error: "请选择 md / pdf / word 文件" };
  }
  const purpose: CoursePurpose =
    String(formData.get("purpose") || "textbook") === "manual" ? "manual" : "textbook";
  // 归属业务：existing = 选已有业务名；new = 填新业务名
  const businessMode = String(formData.get("businessMode") || "new") === "existing" ? "existing" : "new";
  const business = String(formData.get("business") || "").trim();
  if (!business) {
    return { error: businessMode === "existing" ? "请选择这门业务" : "请填写业务名称" };
  }
  const forceLocal = String(formData.get("forceLocal") || "") === "1";
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // 先落「生成中」占位/复用业务课程，解析与生成在后台进行，前端轮询真实状态
    const { courseId } = await startUploadGeneration({
      filename: file.name,
      buffer,
      userId: user.id,
      forceLocal,
      purpose,
      business,
    });
    revalidatePath("/admin");
    return { ok: true, courseId };
  } catch (error) {
    console.error(error);
    return { error: error instanceof Error ? error.message.slice(0, 180) : "上传失败，请稍后重试" };
  }
}

/** 重生成：purpose 决定重建学习宝典还是实操流程 */
export async function rebuildCourseAction(
  courseId: string,
  purpose: CoursePurpose = "textbook",
) {
  const user = await requireAdmin();
  if (!user) return { error: "只有管理员可以重生成" };
  try {
    const { courseId: id } = await startRebuildGeneration(courseId, undefined, purpose);
    revalidatePath("/admin");
    revalidatePath(`/courses/${courseId}`);
    return { ok: true, courseId: id };
  } catch (error) {
    console.error(error);
    return { error: error instanceof Error ? error.message.slice(0, 180) : "重生成失败" };
  }
}

/** 轮询后台生成任务的真实状态（教材工坊用） */
export async function getCourseGenerationAction(courseId: string) {
  const user = await requireAdmin();
  if (!user) return { error: "没有权限" };
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      status: true,
      generationPhase: true,
      generationDone: true,
      generationTotal: true,
      generationError: true,
    },
  });
  if (!course) return { gone: true };
  return { ok: true, ...course };
}

export async function deleteCourseAction(courseId: string) {
  const user = await requireAdmin();
  if (!user) return { error: "只有管理员可以删除课程" };
  try {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return { error: "课程不存在，可能已被删除" };
    // 显式清理关联数据，避免残留学习记录
    await prisma.$transaction(async (tx) => {
      await tx.attempt.deleteMany({ where: { chapter: { courseId } } });
      await tx.caseStudy.deleteMany({ where: { chapter: { courseId } } });
      await tx.question.deleteMany({ where: { chapter: { courseId } } });
      await tx.progress.deleteMany({ where: { courseId } });
      await tx.chapter.deleteMany({ where: { courseId } });
      await tx.course.delete({ where: { id: courseId } });
    });
    await deleteSource(courseId);
    await deleteManualSource(courseId);
    revalidatePath("/admin");
    revalidatePath("/home");
    revalidatePath(`/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { error: error instanceof Error ? error.message.slice(0, 180) : "删除失败，请稍后重试" };
  }
}

export async function toggleCoursePublishAction(courseId: string, published: boolean) {
  const user = await requireAdmin();
  if (!user) return { error: "只有管理员可以上架 / 下架课程" };
  try {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return { error: "课程不存在，可能已被删除" };
    await prisma.course.update({
      where: { id: courseId },
      data: { published },
    });
    revalidatePath("/admin");
    revalidatePath("/home");
    revalidatePath(`/courses/${courseId}`);
    return { ok: true, published };
  } catch (error) {
    console.error(error);
    return { error: "操作失败，请稍后重试" };
  }
}

export async function saveAiSettingsAction(formData: FormData) {
  const user = await requireAdmin();
  if (!user) return { error: "没有权限" };
  const existing = await prisma.appSetting.findUnique({ where: { key: "OPENAI_API_KEY" } });
  const incomingKey = String(formData.get("apiKey") || "").trim();
  const entries = [
    ["OPENAI_API_KEY", incomingKey || existing?.value || ""],
    ["OPENAI_BASE_URL", String(formData.get("baseUrl") || "").trim() || "https://api.openai.com/v1"],
    ["OPENAI_MODEL", String(formData.get("model") || "").trim() || "gpt-4o-mini"],
  ] as const;
  for (const [key, value] of entries) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  revalidatePath("/admin");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 实战案例引擎（admin）                                                 */
/* ------------------------------------------------------------------ */

function parseCaseParams(formData: FormData): CaseEngineParams | null {
  const rawBiz = String(formData.get("bizType") || "").trim();
  const biz = BIZ_OPTIONS.some((o) => o.value === rawBiz) ? (rawBiz as BizType) : "factoring";
  const num = (name: string) => Number(String(formData.get(name) || "").replace(/[^\d.]/g, ""));
  const amountWan = num("amountWan");
  const tenorDays = Math.round(num("tenorDays"));
  const rateBp = num("rateBp");
  const serviceBp = num("serviceBp");
  if (!(amountWan > 0) || !(tenorDays > 0) || !(rateBp > 0)) return null;
  const text = (name: string, fallback: string) => {
    const value = String(formData.get(name) || "").trim();
    return value || fallback;
  };
  return {
    bizType: biz,
    borrower: text("borrower", "深圳云帆智造有限公司"),
    counterparty: text("counterparty", "华信工业集团"),
    amountWan,
    tenorDays,
    rateBp,
    serviceBp: serviceBp > 0 ? serviceBp : 2,
    rating: text("rating", "AA"),
  };
}

export async function generateCaseAction(formData: FormData) {
  const user = await requireAdmin();
  if (!user) return { error: "只有管理员可以生成实战案例" };
  const params = parseCaseParams(formData);
  if (!params) return { error: "参数不正确：金额、占用天数、日费率都要是正数" };
  try {
    const pack = await buildCasePack(params);
    return { ok: true, pack, usedAi: pack.usedAi };
  } catch (error) {
    console.error(error);
    const raw = error instanceof Error ? error.message : "生成失败";
    return { error: raw.slice(0, 180) };
  }
}

export async function attachCasePackAction(formData: FormData) {
  const user = await requireAdmin();
  if (!user) return { error: "只有管理员可以挂载案例" };
  const courseId = String(formData.get("courseId") || "").trim();
  const chapterId = String(formData.get("chapterId") || "").trim();
  const rawPack = String(formData.get("pack") || "");
  if (!courseId || !chapterId || !rawPack) return { error: "参数缺失：请选择课程与章节" };

  let pack: CasePack;
  try {
    pack = normalizePack(JSON.parse(rawPack));
  } catch {
    return { error: "案例数据不完整，请重新生成后再挂载" };
  }
  if (!pack.case.title || !pack.case.scene || !pack.questions.length) {
    return { error: "案例内容不完整，请重新生成后再挂载" };
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const chapter = await tx.chapter.findFirst({ where: { id: chapterId, courseId } });
        if (!chapter) throw new Error("章节不存在，请刷新后重试");
        const top = await tx.question.findFirst({
          where: { chapterId },
          orderBy: { order: "desc" },
          select: { order: true },
        });
        const base = top?.order ?? -1;
        for (const [index, question] of pack.questions.entries()) {
          await tx.question.create({
            data: {
              chapterId,
              type: question.type,
              stem: question.stem,
              optionsJson: JSON.stringify(question.options),
              answerJson: JSON.stringify(question.answer),
              explanation: question.explanation,
              order: base + 1 + index,
            },
          });
        }
        await tx.caseStudy.create({
          data: {
            chapterId,
            title: pack.case.title,
            scene: pack.case.scene,
            analysis: pack.case.analysis,
            metaJson: JSON.stringify(pack.meta ?? {}),
          },
        });
      },
      { timeout: 30000 },
    );
  } catch (error) {
    console.error(error);
    const raw = error instanceof Error ? error.message : "挂载失败";
    return { error: raw.slice(0, 180) };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/case-engine");
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/learn/${chapterId}`);
  revalidatePath(`/courses/${courseId}/quiz/${chapterId}`);
  return { ok: true, courseId, chapterId };
}

class LockedChapterError extends Error {}

export async function submitQuizAction(chapterId: string, answers: number[][]) {
  const user = await requireUser();
  if (!user) return { error: "请先登录" };

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { questions: { orderBy: { order: "asc" } }, course: true },
  });
  if (!chapter) return { error: "关卡不存在" };
  // action 层兜底：下架课程不可再提交（页面层已拦，双保险）
  if (!chapter.course.published && user.role !== "admin") {
    return { error: "这门课已下架，暂不可继续闯关" };
  }

  // 闯关按顺序解锁：通关上一关后本关测验才开放（教材随时可看，不受影响）。
  // 判分是纯计算（不依赖库状态），放事务外先算好
  const row = await prisma.progress.findUnique({
    where: { userId_chapterId: { userId: user.id, chapterId } },
  });
  if (row ? row.status === "locked" : chapter.order !== 1) {
    return { error: "先完成上一关，才能挑战这一关" };
  }
  let correct = 0;
  // 逐题明细：交卷后用于展示每题答案与解析
  const detail = chapter.questions.map((question, index) => {
    const rawExpected = JSON.parse(question.answerJson) as number[];
    const expected = rawExpected.slice().sort((a, b) => a - b);
    const rawGot = answers[index] || [];
    const got = rawGot.slice().sort((a, b) => a - b);
    const isCorrect = got.length === expected.length && got.every((v, i) => v === expected[i]);
    if (isCorrect) correct += 1;
    let options: string[] = [];
    try {
      options = JSON.parse(question.optionsJson || "[]") as string[];
    } catch {
      /* ignore */
    }
    if (!options.length) options = ["正确", "错误"];
    return {
      type: question.type,
      stem: question.stem,
      options,
      correctOptions: rawExpected,
      pickedOptions: rawGot,
      isCorrect,
      explanation: question.explanation || "",
    };
  });
  const total = chapter.questions.length || 1;
  const score = Math.round((correct / total) * 100);
  const passed = score >= chapter.passScore;
  const stars = starsFromScore(score);

  try {
    const settled = await prisma.$transaction(
      async (tx) => {
        // 事务内重读进度：避免基于过期快照结算（如并发双提交）。
        // 极个别场景缺记录（如课程刚导入完成）：仅第 1 关自动补录，其余视为未解锁
        let current = await tx.progress.findUnique({
          where: { userId_chapterId: { userId: user.id, chapterId } },
        });
        if (!current) {
          if (chapter.order !== 1) {
            throw new LockedChapterError("先完成上一关，才能挑战这一关");
          }
          current = await tx.progress.create({
            data: {
              userId: user.id,
              courseId: chapter.courseId,
              chapterId,
              status: "unlocked",
            },
          });
        }
        if (current.status === "locked") {
          throw new LockedChapterError("先完成上一关，才能挑战这一关");
        }
        const wasPassed = current.status === "passed";
        const firstPass = passed && !wasPassed;
        const xpGain = xpFromResult(passed, score, firstPass);

        // ① 答题记录
        await tx.attempt.create({
          data: {
            userId: user.id,
            chapterId,
            score,
            passed,
            answersJson: JSON.stringify(answers),
          },
        });
        // ② 基础经验
        await tx.user.update({
          where: { id: user.id },
          data: { xp: { increment: xpGain } },
        });
        // ③ 关卡进度（bestScore/stars 取历史最大）
        await tx.progress.update({
          where: { id: current.id },
          data: {
            attempts: { increment: 1 },
            bestScore: Math.max(current.bestScore, score),
            stars: Math.max(current.stars, stars),
            status: passed ? "passed" : current.status,
            passedAt: passed ? new Date() : current.passedAt,
          },
        });
        // ④ 通关后解锁下一关（返回被解锁章节供结果页提示）
        const unlockedNext = passed
          ? await unlockNextChapter(user.id, chapter.courseId, chapter.order, tx)
          : null;

        // ⑤ 成就结算：同一事务内幂等发放
        const codes: string[] = [];
        if (firstPass) codes.push("first_pass");
        if (score === 100) codes.push("perfect");
        if (stars === 3) codes.push("three_star");
        if (passed) {
          // 关卡全开放后按“通关章节数 == 课程章节总数”判定全线打通，
          // 避免因缺少进度记录（如课程新导入）而误发
          const courseTotal = await tx.chapter.count({
            where: { courseId: chapter.courseId },
          });
          const passedCount = await tx.progress.count({
            where: { userId: user.id, courseId: chapter.courseId, status: "passed" },
          });
          if (courseTotal > 0 && passedCount >= courseTotal) codes.push("course_clear");
        }
        const afterBase = await tx.user.findUnique({
          where: { id: user.id },
          select: { xp: true },
        });
        if ((afterBase?.xp ?? 0) >= 200) codes.push("xp_200");
        const achievements = await grantAchievements(user.id, codes, tx);
        const fresh = await tx.user.findUnique({
          where: { id: user.id },
          select: { xp: true },
        });
        const xpBonus = achievements.reduce((sum, a) => sum + a.xpReward, 0);

        return {
          xpGain,
          xpBonus,
          xpTotal: fresh?.xp ?? 0,
          unlockedNext,
          achievements,
        };
      },
      { timeout: 30000 },
    );

    revalidatePath("/home");
    revalidatePath(`/courses/${chapter.courseId}`);
    revalidatePath("/leaderboard");

    return {
      ok: true,
      score,
      passed,
      stars,
      correct,
      total,
      passScore: chapter.passScore,
      courseId: chapter.courseId,
      detail,
      xpGain: settled.xpGain,
      xpBonus: settled.xpBonus,
      xpTotal: settled.xpTotal,
      unlockedNext: settled.unlockedNext,
      achievements: settled.achievements,
    };
  } catch (error) {
    if (error instanceof LockedChapterError) {
      return { error: error.message };
    }
    console.error(error);
    return { error: "结算失败，请稍后重试" };
  }
}
