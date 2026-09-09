import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { chapterDisplayTitle } from "@/lib/format";
import { QuizPlayer } from "@/components/QuizPlayer";
import { CourseGeneratingNotice } from "@/components/CourseGeneratingNotice";

export default async function QuizPage({
  params,
}: PageProps<"/courses/[id]/quiz/[chapterId]">) {
  const user = await requireUser();
  if (!user) redirect("/login");
  const { id, chapterId } = await params;
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      course: true,
      questions: { orderBy: { order: "asc" } },
    },
  });
  if (!chapter || chapter.courseId !== id) notFound();
  // 已下架的课程不对学员开放（管理员可以预览）
  if (!chapter.course.published && user.role !== "admin") redirect("/home");
  // 课程正在后台重建：先展示生成中视图（自动刷新，就绪后可正常进入）
  if (chapter.course.status === "generating") {
    return <CourseGeneratingNotice title={chapter.course.title} />;
  }
  // 闯关按顺序解锁：通关上一关后本关才开放（教材页不受此限制）
  const row = await prisma.progress.findUnique({
    where: { userId_chapterId: { userId: user.id, chapterId } },
  });
  if (row ? row.status === "locked" : chapter.order !== 1) {
    redirect(`/courses/${id}`);
  }
  const questions = chapter.questions.map((q) => ({
    id: q.id,
    type: q.type,
    stem: q.stem,
    options: (() => {
      try {
        return JSON.parse(q.optionsJson || "[]") as string[];
      } catch {
        return ["正确", "错误"];
      }
    })(),
  }));

  return (
    <div>
      <h1 className="display text-3xl font-semibold text-ink">
        闯关：{chapterDisplayTitle(chapter.order, chapter.title)}
      </h1>
      <p className="mt-2 text-neutral-text">{chapter.summary}</p>
      <div className="mt-6">
        <QuizPlayer
          chapterId={chapter.id}
          title={chapterDisplayTitle(chapter.order, chapter.title)}
          questions={questions}
        />
      </div>
    </div>
  );
}
