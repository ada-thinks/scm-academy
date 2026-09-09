import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
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
