import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ChapterJourney } from "@/components/ChapterJourney";
import { CourseGeneratingNotice } from "@/components/CourseGeneratingNotice";
import { chapterStory } from "@/lib/chapter-story";
import type { MindNode } from "@/lib/types";

export default async function LearnPage({
  params,
}: PageProps<"/courses/[id]/learn/[chapterId]">) {
  const user = await requireUser();
  if (!user) redirect("/login");
  const { id, chapterId } = await params;
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      cases: true,
      course: true,
      questions: { select: { id: true } },
    },
  });
  if (!chapter || chapter.courseId !== id) notFound();
  // 已下架的课程不对学员开放（管理员可以预览）
  if (!chapter.course.published && user.role !== "admin") redirect("/home");
  // 课程正在后台重建：先展示生成中视图（自动刷新，就绪后可正常进入）
  if (chapter.course.status === "generating") {
    return <CourseGeneratingNotice title={chapter.course.title} />;
  }
  // 教材全开放：任意关卡可直接看；闯关仍按顺序解锁（锁定状态仅用于提示）
  const progress = await prisma.progress.findUnique({
    where: { userId_chapterId: { userId: user.id, chapterId } },
  });
  const locked = progress ? progress.status === "locked" : chapter.order !== 1;

  let mind: MindNode = { id: "root", label: chapter.title, children: [] };
  try {
    mind = JSON.parse(chapter.mindmapJson) as MindNode;
  } catch {
    /* keep default */
  }

  const story = chapterStory(chapter.notesMd);
  const cases = chapter.cases.map((item, index) => {
    let meta: { emoji?: string; chips?: { label: string; value: string }[] } = {};
    try {
      meta = JSON.parse(item.metaJson || "{}");
    } catch {
      /* 老数据无 meta，按文案关键词兜底 */
    }
    return {
      title: item.title,
      scene: item.scene,
      analysis: item.analysis,
      kicker: chapter.cases.length > 1 ? `实战案例 · ${index + 1} / ${chapter.cases.length}` : "实战案例",
      coverEmoji: meta.emoji,
      chips: meta.chips,
    };
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link href={`/courses/${id}`} className="text-sm text-sea">← 关卡地图</Link>
        <Link href={`/courses/${id}`} className="text-sm text-neutral-tip hover:text-sea">
          回课程总览
        </Link>
      </div>
      <ChapterJourney
        order={chapter.order}
        title={chapter.title}
        courseTitle={chapter.course.title}
        courseId={chapter.courseId}
        chapterId={chapter.id}
        summary={chapter.summary}
        coverEmoji={chapter.course.coverEmoji}
        story={story}
        mind={mind}
        cases={cases}
        questionCount={chapter.questions.length}
        passed={progress?.status === "passed"}
        locked={locked}
        priority={chapter.priority}
      />
    </div>
  );
}
