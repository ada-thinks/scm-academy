import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CourseGeneratingNotice } from "@/components/CourseGeneratingNotice";

export default async function CoursePage({ params }: PageProps<"/courses/[id]">) {
  const user = await requireUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      chapters: { orderBy: { order: "asc" } },
      _count: { select: { manualFlows: true } },
    },
  });
  if (!course) notFound();
  // 已下架的课程不对学员开放（管理员可以预览）
  if (!course.published && user.role !== "admin") redirect("/home");
  // 正在后台生成（重建/上传）时，显示自动刷新的生成中视图
  if (course.status === "generating") {
    return <CourseGeneratingNotice title={course.title} />;
  }
  const progress = await prisma.progress.findMany({
    where: { userId: user.id, courseId: id },
  });
  const byChapter = Object.fromEntries(progress.map((p) => [p.chapterId, p]));

  return (
    <div>
      <Link href="/home" className="text-sm text-sea">← 返回营地</Link>
      <div className="hero mt-4 rounded-3xl p-7">
        <div className="flex items-start justify-between gap-4">
          <p className="text-4xl">{course.coverEmoji}</p>
          <nav className="flex rounded-full bg-white/15 p-1 text-sm">
            <span className="rounded-full bg-white px-4 py-1.5 font-semibold text-sea-deep">
              学习宝典
            </span>
            {course._count.manualFlows > 0 ? (
              <Link
                href={`/courses/${course.id}/manual`}
                className="rounded-full px-4 py-1.5 text-white/90 transition hover:bg-white/10"
              >
                实操宝典
              </Link>
            ) : (
              <span
                className="cursor-not-allowed rounded-full px-4 py-1.5 text-white/40"
                title="尚未上传操作手册"
              >
                实操宝典
              </span>
            )}
          </nav>
        </div>
        <h1 className="display mt-2 text-4xl text-white">{course.title}</h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-white/95">{course.description}</p>
      </div>
      {course.status === "failed" && course.generationError && user.role === "admin" && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>⚠ 上次生成失败：{course.generationError}</span>
          <Link href="/admin" className="rounded-full bg-red-500 px-3 py-1 text-xs text-white">
            去教材工坊重试
          </Link>
        </div>
      )}
      <p className="mt-6 text-sm text-mist">
        📖 教材随时可看；闯关按顺序进行，通关后自动解锁下一关
      </p>
      <div className="relative mt-8">
        <div className="absolute top-8 bottom-8 left-8 w-1 rounded-full bg-gold md:left-1/2" />
        <div className="grid gap-6">
          {course.chapters.map((chapter, index) => {
            const row = byChapter[chapter.id];
            // 闯关按顺序解锁：第 1 关默认开放，其余需通关上一关；教材不受限制
            const status = row?.status || (chapter.order === 1 ? "unlocked" : "locked");
            const passed = status === "passed";
            const left = index % 2 === 0;
            return (
              <div key={chapter.id} className={`md:flex ${left ? "md:justify-start" : "md:justify-end"}`}>
                <article className="card map-node relative w-full rounded-3xl p-5 md:w-[46%]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold tracking-widest text-sea">LEVEL {chapter.order}</p>
                      <h2 className="mt-1 text-xl font-semibold leading-snug text-ink">{chapter.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-neutral-text">{chapter.summary}</p>
                    </div>
                    <div className="text-gold">{row?.stars ? "★".repeat(row.stars) : "☆☆☆"}</div>
                  </div>
                  <div className="mt-4 flex gap-3">
                    <Link
                      href={`/courses/${course.id}/learn/${chapter.id}`}
                      className="rounded-full border border-sea/30 bg-white px-4 py-2 text-sm text-sea transition hover:bg-sea/5"
                    >
                      看教材
                    </Link>
                    {status === "locked" ? (
                      <span
                        className="flex items-center gap-1 rounded-full bg-neutral-bg px-4 py-2 text-sm text-neutral-disable"
                        title="通过上一关后自动解锁"
                      >
                        🔒 未解锁
                      </span>
                    ) : (
                      <Link
                        href={`/courses/${course.id}/quiz/${chapter.id}`}
                        className={
                          passed
                            ? "rounded-full border border-amber-500/40 bg-white px-4 py-2 text-sm font-medium text-amber-600 transition hover:border-amber-500/70 hover:bg-amber-50"
                            : "rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-amber-500/25 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-amber-500/35"
                        }
                      >
                        {passed ? "再闯一次" : "开始闯关"}
                      </Link>
                    )}
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
