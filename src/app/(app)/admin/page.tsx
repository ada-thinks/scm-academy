import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { loadAiSettings, hasAi } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { UploadStudio } from "@/components/UploadStudio";
import { hasManualSource, hasSource } from "@/lib/source-store";

export const maxDuration = 300;

export default async function AdminPage() {
  const user = await requireAdmin();
  if (!user) redirect("/home");
  const settings = await loadAiSettings();
  const courses = await prisma.course.findMany({
    include: { _count: { select: { chapters: true, manualFlows: true } } },
    orderBy: { createdAt: "desc" },
  });
  const courseCards = await Promise.all(
    courses.map(async (course) => ({
      id: course.id,
      title: course.title,
      coverEmoji: course.coverEmoji,
      sourceName: course.sourceName,
      manualSourceName: course.manualSourceName,
      business: course.business,
      published: course.published,
      status: course.status,
      generationPhase: course.generationPhase,
      generationDone: course.generationDone,
      generationTotal: course.generationTotal,
      generationError: course.generationError,
      hasSource: await hasSource(course.id),
      hasManualSource: await hasManualSource(course.id),
      chapterCount: course._count.chapters,
      flowCount: course._count.manualFlows,
    })),
  );
  // 已建成业务的名称（去重、非空），用于上传时“已有业务”下拉
  const businesses = [...new Set(courseCards.map((c) => c.business).filter(Boolean))];

  return (
    <div>
      <h1 className="display text-4xl text-ink">教材工坊</h1>
      <p className="mt-2 max-w-2xl text-neutral-text">
        一门业务一门课程，两份文档自动合并：教材 → 学习宝典（一级标题 = 关卡，精讲 / 脑图 / 案例 / 测验）；操作手册 → 实操宝典（流程 + 操作步骤）。
      </p>
      <Link
        href="/admin/case-engine"
        className="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm text-white shadow-[0_8px_20px_-12px_rgba(38,100,253,0.8)] transition-transform hover:-translate-y-0.5"
      >
        ⚡ 实战案例引擎：输入参数，生成带数字的供应链金融案例
      </Link>
      <div className="mt-6">
        <UploadStudio
          hasKey={hasAi(settings)}
          baseUrl={settings.baseUrl}
          model={settings.model}
          courses={courseCards}
          businesses={businesses}
        />
      </div>
    </div>
  );
}
