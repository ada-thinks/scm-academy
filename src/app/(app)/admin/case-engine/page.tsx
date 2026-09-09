import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { loadAiSettings, hasAi } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { CaseEngine } from "@/components/CaseEngine";

export const maxDuration = 300;

export default async function CaseEnginePage() {
  const user = await requireAdmin();
  if (!user) redirect("/home");

  const settings = await loadAiSettings();
  const courses = await prisma.course.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      coverEmoji: true,
      chapters: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          title: true,
          _count: { select: { cases: true } },
        },
      },
    },
  });
  const tree = courses.map((course) => ({
    id: course.id,
    title: course.title,
    coverEmoji: course.coverEmoji,
    chapters: course.chapters.map((chapter) => ({
      id: chapter.id,
      order: chapter.order,
      title: chapter.title,
      caseCount: chapter._count.cases,
    })),
  }));

  return (
    <div>
      <Link href="/admin" className="text-sm text-sea">← 教材工坊</Link>
      <h1 className="display mt-3 text-4xl text-ink">实战案例引擎</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-text">
        输入一组供应链金融参数，生成「带数字的业务冲突 + 风控判断 + 计算题」的实战案例，可挂到任意课程章节。
        计算题的数字由引擎本地算出、保证正确；有 Key 时场景与风控分析由大模型按金标准写法补齐。
      </p>
      <div className="mt-6">
        <CaseEngine
          hasKey={hasAi(settings)}
          model={settings.model}
          courses={tree}
        />
      </div>
    </div>
  );
}
