import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hasManualDownload } from "@/lib/manual-source-file";
import { CourseGeneratingNotice } from "@/components/CourseGeneratingNotice";
import { ManualExplore, type ManualFlowData } from "@/components/ManualExplore";

export default async function ManualPage({ params }: PageProps<"/courses/[id]/manual">) {
  const user = await requireUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      manualFlows: {
        orderBy: { order: "asc" },
        include: { steps: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!course) notFound();
  if (!course.published && user.role !== "admin") redirect("/home");
  if (course.status === "generating") {
    return <CourseGeneratingNotice title={course.title} />;
  }

  const canDownload = await hasManualDownload(course.id, course.manualSourceName);

  const flows: ManualFlowData[] = course.manualFlows.map((f) => ({
    id: f.id,
    order: f.order,
    title: f.title,
    goal: f.goal,
    steps: f.steps.map((s) => ({
      order: s.order,
      kind: s.kind,
      actor: s.actor,
      title: s.title,
      detail: s.detail,
    })),
  }));

  return (
    <div>
      <Link href="/home" className="text-sm text-sea">← 返回营地</Link>

      <header className="hero mt-4 rounded-3xl p-7">
        <div className="flex items-start justify-between gap-4">
          <p className="text-4xl">{course.coverEmoji}</p>
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <nav className="flex rounded-full bg-white/15 p-1 text-sm">
              <Link
                href={`/courses/${id}`}
                className="rounded-full px-4 py-1.5 text-white/90 transition hover:bg-white/10"
              >
                学习宝典
              </Link>
              <span className="rounded-full bg-white px-4 py-1.5 font-semibold text-sea-deep">
                实操宝典
              </span>
            </nav>
            {canDownload && (
              <a
                href={`/courses/${id}/manual/file`}
                download
                className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-white/40 transition hover:bg-white/30"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                  aria-hidden
                >
                  <path d="M10 2a.75.75 0 0 1 .75.75v7.19l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V2.75A.75.75 0 0 1 10 2Zm-5 12a1.5 1.5 0 0 0-1.5 1.5V17A1.5 1.5 0 0 0 5 18.5h10a1.5 1.5 0 0 0 1.5-1.5v-1.5A1.5 1.5 0 0 0 15 14H5Z" />
                </svg>
                下载这份文件
              </a>
            )}
          </div>
        </div>
        <h1 className="display mt-2 text-3xl text-white">{course.title}</h1>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
          实操宝典 · 操作手册与流程图
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/85">
          按真实系统流程拆成可跟做的步骤：建档、报价、授信、新增资产、融资与兑付。左侧选流程，点流程节点看对应操作。
        </p>
      </header>

      {flows.length ? (
        <ManualExplore flows={flows} />
      ) : (
        <div className="card mt-5 rounded-3xl p-8 text-center">
          <p className="text-4xl" aria-hidden>🧭</p>
          <h2 className="display mt-3 text-xl text-ink">这门业务还没有操作手册</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-text">
            管理员把操作手册上传到这门业务后，「实操宝典」会按流程展示操作步骤与流程图。
          </p>
        </div>
      )}
    </div>
  );
}
