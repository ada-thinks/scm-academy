import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const courses = await prisma.course.findMany({
    // 生成中的课程不进入营地（占位/重建期间不可学）
    where: {
      ...(user.role === "admin" ? {} : { published: true }),
      status: { not: "generating" },
    },
    include: {
      chapters: { orderBy: { order: "asc" } },
      _count: { select: { manualFlows: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const progress = await prisma.progress.findMany({ where: { userId: user.id } });
  const achievements = await prisma.userAchievement.findMany({
    where: { userId: user.id },
    include: { achievement: true },
  });

  return (
    <div>
      <section className="hero rounded-3xl p-7">
        <p className="text-gold">欢迎回来，{user.name}</p>
        <h1 className="display mt-1 text-4xl text-white">今天闯哪一关？</h1>
        <div className="mt-5 flex flex-wrap gap-6 text-sm">
          <div>⚡ 经验 {user.xp}</div>
          <div>🏅 成就 {achievements.length}</div>
          <div>📦 课程 {courses.length}</div>
        </div>
        {achievements.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {achievements.map((item) => (
              <span key={item.id} className="rounded-full bg-white/10 px-3 py-1 text-xs">
                {item.achievement.emoji} {item.achievement.name}
              </span>
            ))}
          </div>
        )}
      </section>

      <h2 className="display mt-8 text-3xl text-ink">课程地图</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {courses.map((course) => {
          const rows = progress.filter((p) => p.courseId === course.id);
          const passed = rows.filter((p) => p.status === "passed").length;
          const total = course.chapters.length || 1;
          const percent = Math.round((passed / total) * 100);
          const hasLearning = course.chapters.length > 0;
          const hasManual = course._count.manualFlows > 0;
          return (
            <article key={course.id} className="card map-node rounded-3xl p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-4xl">{course.coverEmoji}</div>
                  <h3 className="mt-3 text-xl font-semibold text-ink">{course.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-text">{course.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {hasLearning ? (
                    <Link
                      href={`/courses/${course.id}`}
                      className="rounded-full bg-gradient-to-r from-sea-deep to-sea px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-sea/30 transition hover:brightness-110"
                    >
                      学习宝典
                    </Link>
                  ) : (
                    <span
                      className="cursor-not-allowed rounded-full border border-neutral-border bg-neutral-bg px-3 py-1 text-xs font-semibold text-neutral-disable"
                      title="教材还没生成好"
                    >
                      学习宝典
                    </span>
                  )}
                  {hasManual ? (
                    <Link
                      href={`/courses/${course.id}/manual`}
                      className="rounded-full border border-sea/50 bg-white px-3 py-1 text-xs font-semibold text-sea transition hover:bg-sand"
                    >
                      实操宝典
                    </Link>
                  ) : (
                    <span
                      className="cursor-not-allowed rounded-full border border-neutral-border bg-neutral-bg px-3 py-1 text-xs font-semibold text-neutral-disable"
                      title="尚未上传操作手册"
                    >
                      实操宝典
                    </span>
                  )}
                </div>
              </div>
              <div className="xp-bar mt-4 h-2 rounded-full">
                <span style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-2 text-xs text-mist">
                {hasManual ? `${passed}/${total} 关已通 · 含操作手册` : `${passed}/${total} 关已通`}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
