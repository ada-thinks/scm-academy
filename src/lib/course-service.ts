import { persistCourse, replaceCourseContent, replaceManualFlows } from "./seed";
import { extractText, sourceTypeOf } from "./parse-document";
import {
  generateCourseLocally,
  generateCourseWithAi,
  hasAi,
  loadAiSettings,
} from "./ai";
import type { GenerationStage } from "./ai";
import { parseManualFlows } from "./manual";
import { prisma } from "./prisma";
import {
  hasManualSource,
  hasSource,
  loadManualSource,
  loadSource,
  saveManualSource,
  saveSource,
} from "./source-store";
import type { Prisma } from "@prisma/client";

export { hasSource, hasManualSource };

/** 一份上传文档的用途：学习宝典教材 / 实操宝典手册 */
export type CoursePurpose = "textbook" | "manual";

/** 上传归属：business 为空 = 独立课程（旧行为）；非空 = 绑定到同名业务课程 */
export type CourseUploadOptions = {
  business?: string;
  forceLocal?: boolean;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

export type NextChapterInfo = { id: string; title: string; order: number } | null;

export type EarnedAchievement = {
  code: string;
  name: string;
  description: string;
  emoji: string;
  xpReward: number;
};

/* ------------------------------------------------------------------ */
/* 同步工具（脚本/测试批量导入用）：上传并立即等完整生成                  */
/* ------------------------------------------------------------------ */

/** 手册里没识别出流程时的报错提示（统一口径，便于上层判断） */
export class NoManualFlowError extends Error {
  constructor() {
    super(
      "没能在手册里识别出流程。建议在每段流程前加一行“流程 N｜流程名”，例如：流程 1｜企业建档。",
    );
    this.name = "NoManualFlowError";
  }
}

async function fileBaseName(filename: string, fallback: string) {
  const base = filename.replace(/\.(md|txt|markdown|pdf|docx)$/i, "").trim();
  return base || fallback;
}

/* ------------------------------------------------------------------ */
/* 同步工具（脚本/测试批量导入用）：上传并立即等完整生成                  */
/* ------------------------------------------------------------------ */

/** 教材同步生成：绑定到 business（同名业务课程存在则整体替换学习宝典，保留手册） */
export async function createCourseFromUpload(params: {
  filename: string;
  buffer: Buffer;
  userId: string;
  forceLocal?: boolean;
  business?: string;
}) {
  const business = (params.business || "").trim();
  const text = await extractText(params.filename, params.buffer);
  if (!text.trim()) {
    throw new Error("没能从文件里读出文字，请检查文件是否为可选中文本。");
  }
  const generated = await buildCourse(text, params.filename, params.forceLocal);
  const finalTitle = business || generated.course.title;

  let course;
  const existing = business
    ? await prisma.course.findFirst({ where: { business } })
    : null;
  if (existing) {
    course = await replaceCourseContent(existing.id, {
      ...generated.course,
      title: finalTitle,
    });
  } else {
    course = await persistCourse(
      { ...generated.course, title: finalTitle },
      params.userId,
      sourceTypeOf(params.filename),
      params.filename,
    );
    await prisma.course.update({
      where: { id: course.id },
      data: { business, published: true },
    });
  }
  await saveSource(course.id, text);
  await prisma.course.update({
    where: { id: course.id },
    data: {
      sourceName: params.filename,
      sourceType: sourceTypeOf(params.filename),
      published: true,
    },
  });
  return { course, usedAi: generated.usedAi };
}

/** 手册同步生成：绑定到 business（同名业务课程存在则整体替换实操流程，保留学习宝典） */
export async function createManualFromUpload(params: {
  filename: string;
  buffer: Buffer;
  userId: string;
  business?: string;
}) {
  const business = (params.business || "").trim();
  const text = await extractText(params.filename, params.buffer);
  if (!text.trim()) {
    throw new Error("没能从文件里读出文字，请检查文件是否为可选中文本。");
  }
  const flows = parseManualFlows(text);
  if (!flows.length) throw new NoManualFlowError();

  let course = business
    ? await prisma.course.findFirst({ where: { business } })
    : null;
  if (!course) {
    const title =
      business || (await fileBaseName(params.filename, "操作手册"));
    course = await prisma.course.create({
      data: {
        title,
        business,
        description: "操作手册已就绪，学习宝典待上传后自动发布。",
        coverEmoji: "🧭",
        sourceType: "manual",
        sourceName: null,
        status: "ready",
        published: false,
        createdById: params.userId,
      },
    });
  }
  const flowCount = await replaceManualFlows(course.id, flows);
  await saveManualSource(course.id, text);
  const chapterCount = await prisma.chapter.count({ where: { courseId: course.id } });
  await prisma.course.update({
    where: { id: course.id },
    data: {
      manualSourceName: params.filename,
      // 只有教材齐了才上架；仅手册时保持草稿
      published: chapterCount > 0,
    },
  });
  return { course, flowCount };
}

/** 教材重建（用已保存的教材原文，按当前规则重新生成学习宝典） */
export async function rebuildCourse(courseId: string, forceLocal?: boolean) {
  const existing = await prisma.course.findUnique({ where: { id: courseId } });
  if (!existing) throw new Error("课程不存在");
  const sourceText = await loadSource(courseId);
  if (!sourceText) {
    throw new Error("这门课没有保存教材原文，请重新上传教材。");
  }
  const generated = await buildCourse(
    sourceText,
    existing.sourceName || "教材",
    forceLocal,
  );
  const finalTitle = (existing.business || "").trim() || generated.course.title;
  const course = await replaceCourseContent(courseId, {
    ...generated.course,
    title: finalTitle,
  });
  return { course, usedAi: generated.usedAi };
}

/** 手册重建（用已保存的手册原文重新解析流程） */
export async function rebuildManual(courseId: string) {
  const existing = await prisma.course.findUnique({ where: { id: courseId } });
  if (!existing) throw new Error("课程不存在");
  const manualText = await loadManualSource(courseId);
  if (!manualText) {
    throw new Error("这门课没有保存手册原文，请重新上传操作手册。");
  }
  const flows = parseManualFlows(manualText);
  if (!flows.length) throw new NoManualFlowError();
  const flowCount = await replaceManualFlows(courseId, flows);
  const chapterCount = await prisma.chapter.count({ where: { courseId } });
  await prisma.course.update({
    where: { id: courseId },
    data: { status: "ready", published: chapterCount > 0 },
  });
  return { course: existing, flowCount };
}

async function buildCourse(
  text: string,
  filename: string,
  forceLocal?: boolean,
  onStage?: (p: GenerationStage) => void,
) {
  const settings = await loadAiSettings();
  if (!forceLocal && hasAi(settings)) {
    try {
      const course = await generateCourseWithAi(text, filename, onStage);
      return { course, usedAi: true };
    } catch (error) {
      console.error(error);
      const course = generateCourseLocally(text, filename);
      course.description = `${course.description}（大模型调用失败，已用教学模板生成，课程仍可学。）`;
      return { course, usedAi: false };
    }
  }
  return { course: generateCourseLocally(text, filename), usedAi: false };
}

/* ------------------------------------------------------------------ */
/* 后台生成编排：上传/重生成立即返回，任务在常驻进程内继续跑             */
/* （本应用是自托管 SQLite 部署；不要直接迁移到无状态 serverless，        */
/*   否则 void runGeneration 的任务可能在请求结束后被冻结）              */
/* ------------------------------------------------------------------ */

export type GenerationKind = "upload" | "rebuild";

async function writeGen(
  courseId: string,
  patch: {
    status?: string;
    generationPhase?: string;
    generationDone?: number;
    generationTotal?: number;
    generationError?: string;
  },
) {
  try {
    await prisma.course.update({ where: { id: courseId }, data: patch });
  } catch (error) {
    console.error("进度写库失败（不影响生成主流程）", error);
  }
}

async function markFailed(courseId: string, message: string) {
  await writeGen(courseId, {
    status: "failed",
    generationPhase: "failed",
    generationDone: 0,
    generationTotal: 0,
    generationError: message.slice(0, 300),
  });
}

function friendlyError(raw: unknown): string {
  const message = raw instanceof Error ? raw.message : "生成失败";
  if (/没能从文件里读出文字/.test(message)) {
    return "没读出文字。扫描版 PDF 请先转成可复制文本，或改用 Word/Markdown。";
  }
  if (/zip file|central directory|\.doc/.test(message)) {
    return message.slice(0, 180);
  }
  if (/JSON|Unterminated|stem is missing|Argument `stem`/i.test(message)) {
    return "大模型这次返回不完整。请再点一次生成；若仍失败，先确认 Key 和模型名。";
  }
  const hint =
    message
      .split("\n")
      .find(
        (line) => line.trim() && !line.includes("Invalid `") && !line.includes("invocation"),
      ) || "生成失败，请换一份教材再试。";
  return hint.slice(0, 180);
}

type RunParams = {
  courseId: string;
  kind: GenerationKind;
  purpose: CoursePurpose;
  buffer?: Buffer;
  filename: string;
  forceLocal?: boolean;
};

async function runGeneration(params: RunParams) {
  const { courseId, kind, purpose, forceLocal, filename } = params;
  try {
    // ① 准备原文：上传 = 现场解析；重建 = 读取对应宝典已保存原文
    let text: string;
    if (kind === "rebuild") {
      text =
        purpose === "textbook"
          ? await loadSource(courseId)
          : await loadManualSource(courseId);
      if (!text.trim()) {
        await markFailed(
          courseId,
          purpose === "textbook"
            ? "这门课没有保存教材原文，请重新上传教材。"
            : "这门课没有保存手册原文，请重新上传操作手册。",
        );
        return;
      }
    } else {
      text = await extractText(filename, params.buffer!);
      if (!text.trim()) {
        await markFailed(courseId, "没能从文件里读出文字，请检查文件是否为可选中文本。");
        return;
      }
    }
    if (purpose === "manual") {
      await runBuildManual(courseId, text, filename);
    } else {
      await runBuildTextbook(courseId, text, filename, forceLocal, kind);
    }
  } catch (error) {
    console.error("后台生成失败", error);
    await markFailed(courseId, friendlyError(error));
  }
}

/** 手册：解析成流程 → 整体替换 manualFlows（不动学习宝典） */
async function runBuildManual(courseId: string, text: string, filename: string) {
  const flows = parseManualFlows(text);
  if (!flows.length) throw new NoManualFlowError();
  await writeGen(courseId, {
    generationPhase: "writing",
    generationDone: 0,
    generationTotal: flows.length,
  });
  await writeGen(courseId, { generationPhase: "persisting" });
  await replaceManualFlows(courseId, flows);
  await saveManualSource(courseId, text);
  // 收尾：流程齐后若已有教材则上架（仅手册保持草稿）
  const chapterCount = await prisma.chapter.count({ where: { courseId } });
  await prisma.course.update({
    where: { id: courseId },
    data: {
      status: "ready",
      generationPhase: "idle",
      generationDone: 0,
      generationTotal: 0,
      generationError: "",
      manualSourceName: filename,
      published: chapterCount > 0,
    },
  });
}

/** 教材：拆一级标题 → 逐关生成 → 整体替换学习宝典（不动手册） */
async function runBuildTextbook(
  courseId: string,
  text: string,
  filename: string,
  forceLocal: boolean | undefined,
  kind: GenerationKind,
) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  const business = (course?.business || "").trim();
  // 拆大纲 + 逐关生成（AI 每关回调推进真实进度；本地模板一次成型）
  const generated = await buildCourse(text, filename, forceLocal, (p) => {
    if (p.stage === "planning") {
      void writeGen(courseId, {
        generationPhase: "planning",
        generationDone: 0,
        generationTotal: 0,
      });
    } else {
      void writeGen(courseId, {
        generationPhase: "writing",
        generationDone: p.done,
        generationTotal: p.total,
      });
    }
  });
  // 一个事务内替换学习宝典章节（manualFlows 不在事务范围内，原样保留）
  await writeGen(courseId, { generationPhase: "persisting" });
  const title = business || generated.course.title;
  await replaceCourseContent(courseId, { ...generated.course, title });
  await saveSource(courseId, text);

  // 收尾：清理进度字段；上传教材后自动上架，重建保持原发布状态
  const patch: Prisma.CourseUpdateInput = {
    status: "ready",
    generationPhase: "idle",
    generationDone: 0,
    generationTotal: 0,
    generationError: "",
    sourceName: filename,
    sourceType: sourceTypeOf(filename),
  };
  if (kind === "upload") patch.published = true;
  await prisma.course.update({ where: { id: courseId }, data: patch });
}

/** 为一次上传准备目标课程：已有同名业务 → 复用（置生成中）；否则建占位课 */
async function preparePlaceholder(
  filename: string,
  business: string,
  purpose: CoursePurpose,
  userId: string,
): Promise<string> {
  if (!business) {
    const base = await fileBaseName(
      filename,
      purpose === "manual" ? "操作手册" : "未命名课程",
    );
    const row = await prisma.course.create({
      data: {
        title: base,
        description:
          purpose === "manual"
            ? "正在解析操作手册…"
            : "正在按一级标题生成学习宝典…",
        coverEmoji: purpose === "manual" ? "🧭" : "📘",
        sourceType: purpose === "textbook" ? sourceTypeOf(filename) : "manual",
        sourceName: purpose === "textbook" ? filename : null,
        status: "generating",
        generationPhase: "parsing",
        published: false,
        createdById: userId,
      },
    });
    return row.id;
  }

  const existing = await prisma.course.findFirst({ where: { business } });
  if (existing) {
    if (existing.status === "generating") {
      throw new Error("该业务正在生成中，请稍后再试");
    }
    await prisma.course.update({
      where: { id: existing.id },
      data: {
        status: "generating",
        generationPhase: "parsing",
        generationDone: 0,
        generationTotal: 0,
        generationError: "",
      },
    });
    return existing.id;
  }

  const row = await prisma.course.create({
    data: {
      title: business,
      description:
        purpose === "manual"
          ? "操作手册解析中…之后再上传教材，会自动合并成完整课程。"
          : "正在按一级标题生成学习宝典…",
      coverEmoji: purpose === "manual" ? "🧭" : "📘",
      business,
      sourceType: purpose === "textbook" ? sourceTypeOf(filename) : "manual",
      sourceName: purpose === "textbook" ? filename : null,
      status: "generating",
      generationPhase: "parsing",
      published: false,
      createdById: userId,
    },
  });
  return row.id;
}

/** 上传文档：按「用途 + 归属业务」先建占位/复用业务课程，解析与生成在后台进行 */
export async function startUploadGeneration(params: {
  filename: string;
  buffer: Buffer;
  userId: string;
  forceLocal?: boolean;
  purpose?: CoursePurpose;
  business?: string;
}): Promise<{ courseId: string }> {
  const purpose = params.purpose ?? "textbook";
  const business = (params.business || "").trim();
  const courseId = await preparePlaceholder(
    params.filename,
    business,
    purpose,
    params.userId,
  );
  void runGeneration({
    courseId,
    kind: "upload",
    purpose,
    buffer: params.buffer,
    filename: params.filename,
    forceLocal: params.forceLocal,
  });
  return { courseId };
}

/** 重建宝典：按用途读对应原文，后台完成后整体替换对应内容 */
export async function startRebuildGeneration(
  courseId: string,
  forceLocal?: boolean,
  purpose: CoursePurpose = "textbook",
): Promise<{ courseId: string }> {
  const existing = await prisma.course.findUnique({ where: { id: courseId } });
  if (!existing) throw new Error("课程不存在");
  if (existing.status === "generating") {
    throw new Error("这门课正在生成中，请稍后再试");
  }
  const sourceText =
    purpose === "textbook"
      ? await loadSource(courseId)
      : await loadManualSource(courseId);
  if (!sourceText) {
    throw new Error(
      purpose === "textbook"
        ? "这门课没有保存教材原文，请重新上传教材。"
        : "这门课没有保存手册原文，请重新上传操作手册。",
    );
  }
  await prisma.course.update({
    where: { id: courseId },
    data: {
      status: "generating",
      generationPhase: "parsing",
      generationDone: 0,
      generationTotal: 0,
      generationError: "",
    },
  });
  void runGeneration({
    courseId,
    kind: "rebuild",
    purpose,
    filename:
      purpose === "textbook"
        ? existing.sourceName || "教材"
        : existing.manualSourceName || "操作手册",
    forceLocal: purpose === "textbook" ? forceLocal : undefined,
  });
  return { courseId };
}

/** 后台任务是否进行中（供页面做生成中提示/拦截） */
export async function isCourseGenerating(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true },
  });
  return course?.status === "generating";
}

/* ------------------------------------------------------------------ */
/* 解锁 / 成就                                                         */
/* ------------------------------------------------------------------ */

/** 解锁下一章；返回被解锁章节（供前端提示），支持在事务内调用 */
export async function unlockNextChapter(
  userId: string,
  courseId: string,
  chapterOrder: number,
  client: DbClient = prisma,
): Promise<NextChapterInfo> {
  const next = await client.chapter.findFirst({
    where: { courseId, order: chapterOrder + 1 },
  });
  if (!next) return null;
  await client.progress.updateMany({
    where: {
      userId,
      chapterId: next.id,
      status: "locked",
    },
    data: { status: "unlocked" },
  });
  return { id: next.id, title: next.title, order: next.order };
}

/** 幂等发放成就（含 XP 奖励）；返回本次新解锁的成就，支持在事务内调用 */
export async function grantAchievements(
  userId: string,
  codes: string[],
  client: DbClient = prisma,
): Promise<EarnedAchievement[]> {
  const unique = [...new Set(codes)];
  const earned: EarnedAchievement[] = [];
  for (const code of unique) {
    const achievement = await client.achievement.findUnique({ where: { code } });
    if (!achievement) continue;
    const exists = await client.userAchievement.findUnique({
      where: { userId_code: { userId, code } },
    });
    if (exists) continue;
    await client.userAchievement.create({ data: { userId, code } });
    if (achievement.xpReward > 0) {
      await client.user.update({
        where: { id: userId },
        data: { xp: { increment: achievement.xpReward } },
      });
    }
    earned.push({
      code: achievement.code,
      name: achievement.name,
      description: achievement.description,
      emoji: achievement.emoji,
      xpReward: achievement.xpReward,
    });
  }
  return earned;
}
