/**
 * 把 book/ 下的 6 个业务知识库 + 6 个操作手册批量生成为 6 门内置课程：
 *   - 学习宝典：知识库按教材一级章节拆关卡，AI 生成（遵循《课程生成规则 v1.1》），失败回退本地模板
 *   - 实操宝典：操作手册解析为流程，并保留原始 PDF 供「下载这份文件」
 *   - 顺带清理被取代的旧课程（内置教材：保理业务知识库 / 线上保理知识库[旧 pdf 课程]）
 *
 * 用法（项目根目录执行）：
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/import-book-courses.ts
 *   追加 --force        全部重新生成
 *   追加 --only=凭证    只处理匹配的一门
 *   追加 --local        不走 AI，用本地模板（快，但内容较模板化）
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { extractText } from "../src/lib/parse-document";
import { generateCourseWithAi, generateCourseLocally } from "../src/lib/ai";
import { parseManualFlows } from "../src/lib/manual";
import { persistCourse, replaceManualFlows } from "../src/lib/seed";
import {
  deleteManualSource,
  deleteSource,
  saveManualFile,
  saveManualSource,
  saveSource,
} from "../src/lib/source-store";

const BOOK_DIR = path.join(process.cwd(), "book");
const SOURCE_PREFIX = "内置教材：";

type Spec = {
  /** 业务归属：一门业务 = 一门课程 */
  business: string;
  /** 课程标题（同时用于生成内置课程标识 sourceName） */
  title: string;
  emoji: string;
  description: string;
  kbFile: string;
  manualFile: string;
};

const SPECS: Spec[] = [
  {
    business: "线上保理",
    title: "线上保理业务知识库",
    emoji: "📋",
    description:
      "从行业背景、业务分类、交易机制到业务流程与风险防控逐关精讲，配套实操宝典覆盖建档、报价、授信、资产、融资、兑付全流程。",
    kbFile: "01 线上保理业务知识库.pdf（13页）.pdf",
    manualFile: "线上保理操作手册（终稿·7页）.pdf",
  },
  {
    business: "信用证",
    title: "信用证业务知识库",
    emoji: "📄",
    description:
      "拆解信用证的定义分类、开证与交单机制、承付与福费廷、兑付与风控要点，配套手册流程逐条对照实操。",
    kbFile: "02 信用证业务知识库.pdf（10页）.pdf",
    manualFile: "信用证操作手册（4页·城建金服）.pdf",
  },
  {
    business: "票据",
    title: "票据业务知识库",
    emoji: "🧾",
    description:
      "讲清票据的法定属性、出票背书保证质押、贴现与转贴现再贴现、提示付款与追索的完整链条。",
    kbFile: "03 票据业务知识库.pdf（10页）.pdf",
    manualFile: "票据业务操作手册（7页）.pdf",
  },
  {
    business: "凭证",
    title: "凭证业务知识库",
    emoji: "🎫",
    description:
      "梳理凭证类产品的定义、开立与转让、融资与提前结清、兑付与风险防控的完整机制。",
    kbFile: "04 凭证业务知识库.pdf（10页）.pdf",
    manualFile: "凭证融资操作手册.pdf",
  },
  {
    business: "订单融资",
    title: "订单融资业务知识库",
    emoji: "📦",
    description:
      "覆盖订单融资的适用场景、建档认证与白名单、额度与报价、订单管理、提款还款与贷后监控。",
    kbFile: "05 订单融资业务知识库.pdf（9页）.pdf",
    manualFile: "订单融资操作手册(1).pdf",
  },
  {
    business: "经销商",
    title: "经销商业务知识库",
    emoji: "🏬",
    description:
      "从经销商融资的准入与名单管理，到立项授信、放款还款、押品与贷后管理的全流程机制。",
    kbFile: "06 经销商业务知识库.pdf（9页）.pdf",
    manualFile: "经销商融资操作手册.pdf",
  },
];

/** 被这 6 门课程取代的历史课程 */
const LEGACY_FILTERS: { label: string; where: { sourceName?: string; sourceType?: string; business?: string } }[] = [
  { label: "内置教材：保理业务知识库（旧）", where: { sourceName: "内置教材：保理业务知识库" } },
  { label: "线上保理知识库（旧 pdf 课程）", where: { sourceType: "pdf", business: "线上保理知识库" } },
];

async function deleteCourseDeep(courseId: string) {
  await prisma.$transaction(
    async (tx) => {
      await tx.attempt.deleteMany({ where: { chapter: { courseId } } });
      await tx.caseStudy.deleteMany({ where: { chapter: { courseId } } });
      await tx.question.deleteMany({ where: { chapter: { courseId } } });
      await tx.progress.deleteMany({ where: { courseId } });
      await tx.manualFlow.deleteMany({ where: { courseId } });
      await tx.chapter.deleteMany({ where: { courseId } });
      await tx.course.delete({ where: { id: courseId } });
    },
    { timeout: 30000 },
  );
  await deleteSource(courseId);
  await deleteManualSource(courseId);
}

async function cleanupLegacy() {
  for (const legacy of LEGACY_FILTERS) {
    const rows = await prisma.course.findMany({ where: legacy.where, select: { id: true, title: true } });
    for (const row of rows) {
      console.log(`🗑  清理旧课程：${row.title}（${row.id}）`);
      await deleteCourseDeep(row.id);
    }
  }
}

async function importOne(spec: Spec, adminId: string, opts: { force: boolean; local: boolean }) {
  const sourceName = `${SOURCE_PREFIX}${spec.title}`;
  console.log(`\n===== ${spec.title}｜业务：${spec.business} =====`);

  const kbBuffer = await readFile(path.join(BOOK_DIR, spec.kbFile));
  const kbText = await extractText(spec.kbFile, kbBuffer);
  if (!kbText.trim()) throw new Error(`读不出正文：${spec.kbFile}`);

  let course = await prisma.course.findFirst({ where: { sourceName } });
  const chapterCount = course ? await prisma.chapter.count({ where: { courseId: course.id } }) : 0;

  if (course && chapterCount > 0 && !opts.force) {
    console.log(`⏭  学习宝典已存在（${chapterCount} 关），跳过生成`);
  } else {
    if (course) {
      console.log(`♻️  重建：先删除旧课程（${chapterCount} 关）`);
      await deleteCourseDeep(course.id);
      course = null;
    }
    console.log(`📖 生成学习宝典：${spec.kbFile}`);
    const started = Date.now();
    const generated = opts.local
      ? generateCourseLocally(kbText, spec.kbFile)
      : await generateCourseWithAi(kbText, spec.kbFile, (p) => {
          if (p.stage === "writing") {
            process.stdout.write(`\r    正在写第 ${p.done + 1}/${p.total} 关…    `);
          }
        });
    if (!opts.local) process.stdout.write("\n");
    console.log(`    完成：${generated.chapters.length} 关，用时 ${Math.round((Date.now() - started) / 1000)}s`);

    course = await persistCourse(
      { ...generated, title: spec.title, description: spec.description, coverEmoji: spec.emoji },
      adminId,
      "builtin",
      sourceName,
    );
    await saveSource(course.id, kbText);
  }

  // —— 实操宝典：把操作手册解析成流程，并保留原始文件供下载 ——
  const manualBuffer = await readFile(path.join(BOOK_DIR, spec.manualFile));
  const manualText = await extractText(spec.manualFile, manualBuffer);
  const flows = parseManualFlows(manualText);
  const flowCount = await prisma.manualFlow.count({ where: { courseId: course.id } });

  if (!flows.length) {
    console.warn(`⚠️  手册没解析出流程：${spec.manualFile}`);
  } else if (flowCount > 0 && !opts.force) {
    console.log(`⏭  实操宝典已有 ${flowCount} 个流程，跳过`);
  } else {
    await replaceManualFlows(course.id, flows);
    console.log(`🧭 实操宝典：写入 ${await prisma.manualFlow.count({ where: { courseId: course.id } })} 个流程`);
  }
  await saveManualSource(course.id, manualText);
  await saveManualFile(course.id, spec.manualFile, manualBuffer);

  await prisma.course.update({
    where: { id: course.id },
    data: {
      title: spec.title,
      description: spec.description,
      coverEmoji: spec.emoji,
      business: spec.business,
      manualSourceName: spec.manualFile,
      sourceType: "builtin",
      status: "ready",
      published: true,
    },
  });

  console.log(
    `✅ ${spec.title} 就绪：${await prisma.chapter.count({ where: { courseId: course.id } })} 关 / ${await prisma.manualFlow.count({ where: { courseId: course.id } })} 个实操流程（id=${course.id}）`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const local = args.includes("--local");
  const only = args
    .find((a) => a.startsWith("--only="))
    ?.slice("--only=".length)
    .trim();

  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) throw new Error("找不到 admin 用户，请先执行 npm run db:seed");

  await cleanupLegacy();

  // --only 支持序号（1~6，逗号分隔，避免命令行中文乱码）或业务名关键字
  const keys = only
    ? only
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : [];
  const specs = keys.length
    ? SPECS.filter(
        (s, index) =>
          keys.includes(String(index + 1)) ||
          keys.some((k) => s.business.includes(k) || s.title.includes(k)),
      )
    : SPECS;
  if (!specs.length) throw new Error(`--only=${only} 没有匹配到课程（可用 1~6 序号，逗号分隔）`);

  for (const spec of specs) {
    await importOne(spec, admin.id, { force, local });
  }

  console.log("\n🎉 全部完成");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("\n❌ 失败：", error);
    await prisma.$disconnect();
    process.exit(1);
  });
