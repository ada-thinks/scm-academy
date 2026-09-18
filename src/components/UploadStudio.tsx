"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ClipboardList, Eye, EyeOff, FileText, Loader2, Trash2 } from "lucide-react";
import type { CoursePurpose } from "@/lib/course-service";
import {
  deleteCourseAction,
  getCourseGenerationAction,
  rebuildCourseAction,
  saveAiSettingsAction,
  toggleCoursePublishAction,
  uploadCourseAction,
} from "@/lib/actions";

type CourseCard = {
  id: string;
  title: string;
  coverEmoji: string;
  sourceType: string;
  sourceName: string | null;
  manualSourceName: string | null;
  business: string;
  published: boolean;
  status: string; // generating | ready | failed
  generationPhase: string;
  generationDone: number;
  generationTotal: number;
  generationError: string;
  hasSource: boolean; // 学习宝典教材原文已保存
  hasManualSource: boolean; // 操作手册原文已保存
  chapterCount: number;
  flowCount: number;
};

type Job = {
  kind: "upload" | "rebuild";
  purpose: CoursePurpose;
  courseId: string;
  title: string;
};

/** 由后台任务真实阶段渲染的文案（区分学习宝典 / 实操宝典） */
function genStageLabel(
  purpose: CoursePurpose,
  phase: string,
  done: number,
  total: number,
  withAi: boolean,
) {
  const learning = purpose === "textbook";
  switch (phase) {
    case "parsing":
      return learning
        ? withAi
          ? "正在读取教材、拆分结构…"
          : "正在读取教材、按一级标题拆关…"
        : "正在读取操作手册、识别流程…";
    case "planning":
      return learning ? "正在拆关卡大纲…" : "正在整理流程顺序…";
    case "writing":
      if (total <= 0) return learning ? "正在逐关生成…" : "正在识别流程节点…";
      return learning
        ? withAi
          ? `正在逐关精讲（第 ${Math.min(done + 1, total)} / ${total} 关），这一步最慢…`
          : `正在逐关生成精讲与题目（${Math.min(done + 1, total)} / ${total} 关）…`
        : `已拆出 ${Math.min(done + 1, total)} / ${total} 条流程，正在整理步骤…`;
    case "persisting":
      return learning ? "正在写入课程与闯关题…" : "正在写入流程图与操作步骤…";
    default:
      return "准备中…";
  }
}

export function UploadStudio({
  hasKey,
  baseUrl,
  model,
  courses,
  businesses,
}: {
  hasKey: boolean;
  baseUrl: string;
  model: string;
  courses: CourseCard[];
  businesses: string[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  // 当前正在轮询的后台生成任务
  const [job, setJob] = useState<Job | null>(null);
  const [phase, setPhase] = useState("parsing");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingPublishId, setTogglingPublishId] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  // 上传表单：文档用途 + 归属业务
  const [purpose, setPurpose] = useState<CoursePurpose>("textbook");
  const [businessMode, setBusinessMode] = useState<"existing" | "new">(
    businesses.length ? "existing" : "new",
  );
  const [businessName, setBusinessName] = useState(businesses[0] ?? "");

  // 轮询后台生成状态：每 1.4s 问一次，直到 ready / failed
  useEffect(() => {
    if (!job) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      const res = await getCourseGenerationAction(job.courseId);
      if ("error" in res && res.error) {
        if (stopped) return;
        setError(res.error);
        setJob(null);
        return;
      }
      if (res.gone) {
        if (stopped) return;
        setError("课程已不存在，可能被其他人删除。");
        setJob(null);
        return;
      }
      if (!("ok" in res) || !res.ok) return; // 防御：不属于上面的错误/消失分支则直接结束
      setPhase(res.generationPhase);
      setDone(res.generationDone);
      setTotal(res.generationTotal);
      if (res.status === "ready") {
        const wasUpload = job.kind === "upload";
        router.refresh();
        setJob(null);
        if (wasUpload) {
          router.push(
            job.purpose === "manual"
              ? `/courses/${job.courseId}/manual`
              : `/courses/${job.courseId}`,
          );
        } else {
          setMsg(
            job.purpose === "manual"
              ? "已按最新手册重新解析，流程已替换。"
              : "已按示例课标准重新生成，内容已替换。",
          );
        }
        return;
      }
      if (res.status === "failed") {
        setError(res.generationError || "生成失败，请重试");
        setJob(null);
        return;
      }
      timer = setTimeout(tick, 1400);
    };
    tick();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [job, router]);

  const busy = job !== null;
  const uploadOverlay = busy && job?.kind === "upload";
  const rebuildOverlay = busy && job?.kind === "rebuild";
  const stageLabel = genStageLabel(
    job?.purpose ?? purpose,
    phase,
    done,
    total,
    hasKey,
  );

  async function onUpload(formData: FormData) {
    setError("");
    setMsg("");
    const res = await uploadCourseAction(formData);
    if (res.error) {
      setError(res.error);
      return;
    }
    setPhase("parsing");
    setDone(0);
    setTotal(0);
    // 走到这里说明返回了 ok，courseId 必存在（React 对 Server Action 的扁平类型拿不到，断言处理）
    setJob({ kind: "upload", purpose, courseId: res.courseId as string, title: "" });
  }

  async function handleUploadSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!businessName.trim()) {
      setError(businessMode === "existing" ? "请先选择这门业务" : "请填写业务名称，例如「信用证」「票据」");
      return;
    }
    const formData = new FormData(e.currentTarget);
    formData.set("purpose", purpose);
    formData.set("businessMode", businessMode);
    formData.set("business", businessName.trim());
    await onUpload(formData);
  }

  async function onSave(formData: FormData) {
    setError("");
    const res = await saveAiSettingsAction(formData);
    if (res.error) {
      setError(res.error);
    } else {
      setMsg("API 配置已保存。之后上传会逐关精讲，对标示例课。");
    }
  }

  async function onRebuild(courseId: string, purpose: CoursePurpose, title: string) {
    setError("");
    setMsg("");
    const res = await rebuildCourseAction(courseId, purpose);
    if (res.error) {
      setError(res.error);
      return;
    }
    setPhase("parsing");
    setDone(0);
    setTotal(0);
    setJob({ kind: "rebuild", purpose, courseId: res.courseId as string, title });
  }

  async function onDeleteCourse(courseId: string) {
    setDeletingId(courseId);
    setError("");
    const res = await deleteCourseAction(courseId);
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    setMsg("课程已删除");
    router.refresh();
  }

  async function onTogglePublish(courseId: string, published: boolean) {
    setTogglingPublishId(courseId);
    setError("");
    const res = await toggleCoursePublishAction(courseId, published);
    setTogglingPublishId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    setMsg(res.published ? "已上架，学员可以在课程地图看到这门课。" : "已下架，学员端不再展示这门课。");
    router.refresh();
  }

  const progressPercent = total > 0 ? Math.round((Math.min(done, total) / total) * 100) : null;
  const uploadTitle = purpose === "manual" ? "投放操作手册" : "投放教材";

  return (
    <div className="grid gap-6">
      {error && (
        <p className="whitespace-pre-wrap rounded-xl bg-red-50 px-3 py-2 text-sm text-coral">{error}</p>
      )}
      {!busy && msg && (
        <p className="whitespace-pre-wrap text-sm text-sea">{msg}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleUploadSubmit} className="card relative overflow-hidden rounded-3xl p-6">
          <h2 className="display text-2xl">{uploadTitle}</h2>
          <p className="mt-2 text-sm text-neutral-text">
            一份文档投放一门业务：教材生成「学习宝典」（一级标题=关卡），手册解析成「实操宝典」（流程+步骤）。
            同一业务先传哪一份都行，第二份会自动合并。
          </p>

          {/* 文档用途 */}
          <div className="mt-4 flex gap-2">
            {(
              [
                { value: "textbook" as const, label: "学习教材", icon: <BookOpen size={15} /> },
                { value: "manual" as const, label: "操作手册", icon: <ClipboardList size={15} /> },
              ] as const
            ).map((opt) => {
              const active = purpose === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={busy}
                  onClick={() => setPurpose(opt.value)}
                  className={
                    active
                      ? "inline-flex items-center gap-1.5 rounded-full bg-sea px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                      : "inline-flex items-center gap-1.5 rounded-full border border-neutral-border px-4 py-1.5 text-sm text-neutral-text transition hover:bg-sand disabled:opacity-50"
                  }
                >
                  {opt.icon}
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* 归属业务：新建 / 已有 */}
          <div className="mt-4 grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="flex items-center gap-1 rounded-full bg-neutral-bg/70 p-1 text-xs">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusinessMode("new");
                  setBusinessName("");
                }}
                className={
                  businessMode === "new"
                    ? "rounded-full bg-white px-3 py-1 font-semibold text-ink shadow-sm"
                    : "rounded-full px-3 py-1 text-neutral-tip hover:text-ink"
                }
              >
                新建业务
              </button>
              <button
                type="button"
                disabled={busy || !businesses.length}
                onClick={() => {
                  setBusinessMode("existing");
                  setBusinessName(businesses[0] ?? "");
                }}
                title={!businesses.length ? "还没有已建业务，先在左侧新建一个" : ""}
                className={
                  businessMode === "existing"
                    ? "rounded-full bg-white px-3 py-1 font-semibold text-ink shadow-sm"
                    : "rounded-full px-3 py-1 text-neutral-tip hover:text-ink disabled:opacity-40"
                }
              >
                已有业务
              </button>
            </div>
            {businessMode === "existing" ? (
              <select
                name="business"
                value={businessName}
                disabled={busy || !businesses.length}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full rounded-xl border border-neutral-border bg-white px-3 py-2 text-sm disabled:opacity-50"
              >
                {businesses.length ? (
                  businesses.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))
                ) : (
                  <option value="">暂无业务，请选「新建业务」</option>
                )}
              </select>
            ) : (
              <input
                name="business"
                value={businessName}
                disabled={busy}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="业务名，如：信用证 / 保理 / 票据"
                className="w-full rounded-xl border border-neutral-border px-3 py-2 text-sm disabled:opacity-50"
              />
            )}
          </div>

          {fileName && (
            <p className="mt-4 inline-flex max-w-full items-center gap-2 truncate rounded-xl bg-sand px-3 py-2 text-sm text-ink">
              <FileText size={15} className="shrink-0 text-sea" />
              <span className="truncate">{fileName}</span>
            </p>
          )}
          <input
            type="file"
            name="file"
            accept=".md,.txt,.markdown,.pdf,.docx"
            required
            disabled={busy}
            onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
            className="mt-2 w-full cursor-pointer text-sm disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            disabled={busy}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-sea px-5 py-2 text-white disabled:opacity-60"
          >
            {uploadOverlay && <Loader2 size={16} className="animate-spin" />}
            {uploadOverlay
              ? purpose === "manual"
                ? "解析中…"
                : "生成中…"
              : purpose === "manual"
                ? "解析成实操流程"
                : "按一级标题生成"}
          </button>

          {uploadOverlay && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/85 p-6 text-center backdrop-blur-[2px]">
              <Loader2 size={32} className="animate-spin text-sea" />
              <p className="mt-4 max-w-[18rem] text-sm font-medium leading-relaxed text-ink">
                {stageLabel}
              </p>
              {progressPercent !== null ? (
                <>
                  <div className="mt-4 h-2 w-full max-w-[16rem] overflow-hidden rounded-full bg-neutral-border/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sea to-primary-hover transition-[width] duration-500 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs tabular-nums text-neutral-text">{progressPercent}%</p>
                </>
              ) : (
                <p className="mt-3 text-xs text-mist">进行中，可留在本页等待完成</p>
              )}
            </div>
          )}
        </form>

        <form action={onSave} className="card rounded-3xl p-6">
          <h2 className="display text-2xl">大模型钥匙</h2>
          <p className="mt-2 text-sm text-neutral-text">
            要和示例课一样能「讲人话」，请配置 OpenAI 兼容接口（DeepSeek / 通义 / OpenAI）。不配也能生成结构完整的关卡，但口吻会更模板化。
          </p>
          <p className="mt-2 text-xs text-mist">
            当前：{hasKey ? "已保存，重新打开不用再填。只有要换 Key 时才输入新的。" : "未配置，走示例课教学模板"}
          </p>
          <label className="mt-4 block text-sm">
            API Key
            <input
              name="apiKey"
              type="password"
              placeholder={hasKey ? "已保存，留空则保持不变" : "sk-..."}
              className="mt-1 w-full rounded-xl border border-neutral-border px-3 py-2"
            />
          </label>
          <label className="mt-3 block text-sm">
            Base URL
            <input name="baseUrl" defaultValue={baseUrl} className="mt-1 w-full rounded-xl border border-neutral-border px-3 py-2" />
          </label>
          <label className="mt-3 block text-sm">
            模型名
            <input name="model" defaultValue={model} className="mt-1 w-full rounded-xl border border-neutral-border px-3 py-2" />
          </label>
          <button className="mt-5 rounded-full bg-gold px-5 py-2 text-ink">保存配置</button>
        </form>
      </div>

      <section>
        <h2 className="display text-2xl">业务课程</h2>

        {rebuildOverlay && (
          <div className="mt-3 rounded-2xl border border-neutral-border/60 bg-white/70 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <Loader2 size={15} className="animate-spin text-sea" />
              <span className="truncate">
                正在重写「{job?.title}」：{stageLabel}
              </span>
              {progressPercent !== null && (
                <span className="ml-auto shrink-0 tabular-nums text-neutral-text">{progressPercent}%</span>
              )}
            </div>
            {progressPercent !== null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-border/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sea to-primary-hover transition-[width] duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
          </div>
        )}

        <ul className="mt-3 grid gap-2">
          {courses.map((course) => {
            const generating = course.status === "generating";
            const failed = course.status === "failed";
            const rowBusy = busy || deletingId === course.id || togglingPublishId === course.id || generating;
            const isBuiltin = course.sourceType === "builtin";
            const sourceLabel = course.sourceName || course.manualSourceName || "";
            return (
              <li
                key={course.id}
                className="card flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {course.coverEmoji} {course.title}
                    </span>
                    {course.business && (
                      <span className="rounded-full bg-sand px-2 py-0.5 text-xs text-sea">{course.business}</span>
                    )}
                    {course.sourceType === "builtin" && (
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700">内置课程</span>
                    )}
                    {course.chapterCount > 0 && (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-600">
                        📘 学习 {course.chapterCount} 关
                      </span>
                    )}
                    {course.flowCount > 0 && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-600">
                        🧭 实操 {course.flowCount} 流程
                      </span>
                    )}
                    {sourceLabel && <span className="text-mist">{sourceLabel}</span>}
                    {generating ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        <Loader2 size={11} className="animate-spin" /> 生成中
                      </span>
                    ) : failed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">
                        ⚠ 生成失败
                      </span>
                    ) : course.published ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sea/10 px-2 py-0.5 text-xs text-sea">
                        <Eye size={11} /> 已上架
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-bg px-2 py-0.5 text-xs text-neutral-disable">
                        <EyeOff size={11} /> 已下架
                      </span>
                    )}
                  </div>
                  {failed && course.generationError && (
                    <p className="mt-1.5 max-w-xl truncate text-xs text-red-500">原因：{course.generationError}</p>
                  )}
                  {confirmDeleteId === course.id && !isBuiltin && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs">
                      <span className="text-coral">
                        删除「{course.title}」后，学习关卡、实操流程图与全部学习记录都会一并移除，确认删除？
                      </span>
                      <button
                        type="button"
                        disabled={deletingId === course.id}
                        onClick={() => onDeleteCourse(course.id)}
                        className="inline-flex items-center gap-1 rounded-full bg-coral px-3 py-1 text-white disabled:opacity-50"
                      >
                        {deletingId === course.id && <Loader2 size={12} className="animate-spin" />}
                        {deletingId === course.id ? "删除中…" : "确认删除"}
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === course.id}
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-full border border-neutral-border px-3 py-1 hover:bg-sand"
                      >
                        取消
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={rowBusy}
                    onClick={() => onTogglePublish(course.id, !course.published)}
                    className={
                      course.published
                        ? "rounded-full border border-neutral-border px-3 py-1 text-xs hover:bg-sand disabled:opacity-50"
                        : "rounded-full bg-sea px-3 py-1 text-xs text-white hover:bg-sea/90 disabled:opacity-50"
                    }
                  >
                    {togglingPublishId === course.id ? (
                      <>
                        <Loader2 size={12} className="mr-1 inline animate-spin" />
                        {course.published ? "下架中…" : "上架中…"}
                      </>
                    ) : course.published ? (
                      "下架"
                    ) : (
                      "上架"
                    )}
                  </button>
                  {course.hasSource && (
                    <button
                      type="button"
                      disabled={busy || generating}
                      onClick={() => onRebuild(course.id, "textbook", course.title)}
                      title="按当前规则（一级标题=关卡）重新生成学习宝典"
                      className={
                        failed
                          ? "inline-flex items-center gap-1 rounded-full bg-sea px-3 py-1 text-xs text-white hover:bg-sea/90 disabled:opacity-50"
                          : "inline-flex items-center gap-1 rounded-full border border-neutral-border px-3 py-1 text-xs text-sea hover:bg-sand disabled:opacity-50"
                      }
                    >
                      <BookOpen size={12} />
                      教材重生成
                    </button>
                  )}
                  {course.hasManualSource && (
                    <button
                      type="button"
                      disabled={busy || generating}
                      onClick={() => onRebuild(course.id, "manual", course.title)}
                      title="用保存的操作手册原文重新解析流程图"
                      className={
                        failed
                          ? "inline-flex items-center gap-1 rounded-full bg-sea px-3 py-1 text-xs text-white hover:bg-sea/90 disabled:opacity-50"
                          : "inline-flex items-center gap-1 rounded-full border border-neutral-border px-3 py-1 text-xs text-sea hover:bg-sand disabled:opacity-50"
                      }
                    >
                      <ClipboardList size={12} />
                      手册重解析
                    </button>
                  )}
                  {!generating && !isBuiltin && (
                    <button
                      type="button"
                      disabled={busy || deletingId === course.id}
                      onClick={() => setConfirmDeleteId(course.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-coral/40 px-3 py-1 text-xs text-coral hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 size={12} />
                      删除
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
