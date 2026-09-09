"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { attachCasePackAction, generateCaseAction } from "@/lib/actions";
import { cleanChapterTitle } from "@/lib/format";
import { BIZ_OPTIONS } from "@/lib/case-types";
import type { CasePack } from "@/lib/case-types";
import { CaseDossier } from "@/components/CaseDossier";

type ChapterOption = { id: string; order: number; title: string; caseCount: number };
type CourseOption = { id: string; title: string; coverEmoji: string; chapters: ChapterOption[] };
type DossierChip = { label: string; value: string };

const TYPE_LABEL: Record<string, string> = { single: "单选", multi: "多选", judge: "判断" };
const TYPE_META: Record<string, { emoji: string; ring: string; badge: string }> = {
  single: { emoji: "🧮", ring: "border-t-sea", badge: "bg-primary-base text-sea" },
  multi: { emoji: "🎯", ring: "border-t-gold", badge: "bg-sand text-ink" },
  judge: { emoji: "⚖️", ring: "border-t-ink", badge: "bg-neutral-bg text-neutral-text" },
};

function chipsFrom(form: FormData): DossierChip[] {
  const bizRaw = String(form.get("bizType") || "factoring");
  const biz = BIZ_OPTIONS.find((option) => option.value === bizRaw);
  const num = (name: string) => Number(String(form.get(name) || "").replace(/[^\d.]/g, ""));
  const chips: DossierChip[] = [];
  chips.push({ label: "业务", value: biz ? `${biz.emoji} ${biz.label}` : "保理融资" });
  const amount = num("amountWan");
  if (amount > 0) chips.push({ label: "融资金额", value: `${amount} 万元` });
  const tenor = Math.round(num("tenorDays"));
  if (tenor > 0) chips.push({ label: "账期", value: `${tenor} 天` });
  const rate = num("rateBp");
  if (rate > 0) chips.push({ label: "日费率", value: `万${rate}` });
  const service = num("serviceBp");
  if (service > 0) chips.push({ label: "服务费", value: `${service}‰` });
  const rating = String(form.get("rating") || "AA").trim();
  if (rating) chips.push({ label: "买方评级", value: rating });
  return chips;
}

export function CaseEngine({
  hasKey,
  model,
  courses,
}: {
  hasKey: boolean;
  model: string;
  courses: CourseOption[];
}) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [chapterId, setChapterId] = useState(courses[0]?.chapters[0]?.id ?? "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pack, setPack] = useState<CasePack | null>(null);
  const [chips, setChips] = useState<DossierChip[]>([]);
  const [coverEmoji, setCoverEmoji] = useState("🧾");
  const [attachTarget, setAttachTarget] = useState<{ courseId: string; chapterId: string } | null>(null);
  const [attached, setAttached] = useState<{ courseId: string; chapterId: string; title: string } | null>(null);

  const selectedCourse = courses.find((course) => course.id === courseId) || courses[0];

  function pickCourse(next: string) {
    setCourseId(next);
    const first = courses.find((course) => course.id === next)?.chapters[0];
    setChapterId(first?.id ?? "");
  }

  async function onGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasKey) {
      setMsg("当前未配置大模型 Key，将用内置参数化模板生成——数字同样真实、结构同样完整。");
    }
    setBusy(true);
    setMsg("");
    setPack(null);
    setChips([]);
    setAttached(null);
    const form = new FormData(event.currentTarget);
    const res = await generateCaseAction(form);
    setBusy(false);
    if ("error" in res && res.error) {
      setMsg(res.error);
      return;
    }
    if (!("pack" in res) || !res.pack) return;
    setPack(res.pack);
    setChips(chipsFrom(form));
    const biz = BIZ_OPTIONS.find((option) => option.value === String(form.get("bizType") || ""));
    setCoverEmoji(biz?.emoji ?? "🧾");
    setAttachTarget({ courseId, chapterId });
    setMsg(res.pack.usedAi ? "已生成（大模型）" : "已生成（本地模板）");
  }

  async function onAttach(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pack || !attachTarget) return;
    setBusy(true);
    setMsg("正在挂载到章节…");
    const form = new FormData();
    form.set("courseId", attachTarget.courseId);
    form.set("chapterId", attachTarget.chapterId);
    form.set("pack", JSON.stringify(pack));
    const res = await attachCasePackAction(form);
    setBusy(false);
    if ("error" in res && res.error) {
      setMsg(res.error);
      return;
    }
    const chapter = selectedCourse?.chapters.find((item) => item.id === attachTarget.chapterId);
    setAttached({ courseId: attachTarget.courseId, chapterId: attachTarget.chapterId, title: chapter?.title || "" });
    setMsg("已挂载成功！学员进入该章节就能看到案例，关卡测验也加入了这批题目。");
    router.refresh();
  }

  const inputCls = "mt-1 w-full rounded-xl border border-neutral-border px-3 py-2 text-sm";

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* 参数表单 */}
        <form onSubmit={onGenerate} className="card rounded-3xl p-6">
          <h2 className="display text-2xl">1 · 设定一笔业务</h2>
          <p className="mt-1 text-xs text-neutral-text">
            {hasKey ? `已配置大模型（${model}）：场景与风控分析走 AI，计算题由引擎保证正确。` : "未配置 Key：走内置参数化模板，可上演示台。"}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              业务类型
              <select name="bizType" defaultValue="factoring" className={inputCls}>
                {BIZ_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.emoji} {option.label} · {option.desc}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              融资方 / 借款人
              <input name="borrower" defaultValue="深圳云帆智造有限公司" className={inputCls} />
            </label>
            <label className="block text-sm sm:col-span-2">
              交易对手（买方 / 下单方）
              <input name="counterparty" defaultValue="华信工业集团" className={inputCls} />
            </label>
            <label className="block text-sm">
              融资金额（万元）
              <input name="amountWan" type="number" inputMode="decimal" min="1" step="0.01" defaultValue="300" required className={inputCls} />
            </label>
            <label className="block text-sm">
              账期 / 占用天数
              <input name="tenorDays" type="number" inputMode="numeric" min="1" defaultValue="90" required className={inputCls} />
            </label>
            <label className="block text-sm">
              日费率（万分之）
              <input name="rateBp" type="number" inputMode="decimal" min="0.1" step="0.1" defaultValue="3" required className={inputCls} />
            </label>
            <label className="block text-sm">
              服务费（‰，一次性）
              <input name="serviceBp" type="number" inputMode="decimal" min="0" step="0.1" defaultValue="2" className={inputCls} />
            </label>
            <label className="block text-sm">
              主体 / 买方评级
              <select name="rating" defaultValue="AA" className={inputCls}>
                {["AAA", "AA", "A", "BBB", "BB", "B"].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
          </div>

          <button
            disabled={busy || !courses.length}
            className="mt-5 w-full rounded-full bg-sea px-5 py-2.5 text-white disabled:opacity-60"
          >
            {busy ? "生成中…" : "生成实战案例"}
          </button>
          {msg && <p className="mt-3 whitespace-pre-wrap text-sm text-sea">{msg}</p>}
        </form>

        {/* 挂载位置 */}
        <div className="card rounded-3xl p-6">
          <h2 className="display text-2xl">2 · 挂到哪一关</h2>
          <p className="mt-1 text-xs text-neutral-text">
            案例会出现在该关「知识脑图」旁的案例卡里，配套题目自动加入该关的闯关测验。
          </p>
          {courses.length === 0 ? (
            <p className="mt-6 rounded-2xl bg-neutral-bg p-4 text-sm text-neutral-text">
              还没有课程。请先在「教材工坊」上传或生成一门课程，再回来挂载案例。
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              <label className="block text-sm">
                课程
                <select value={courseId} onChange={(event) => pickCourse(event.target.value)} className={inputCls}>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.coverEmoji} {course.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                章节（关卡）
                <select value={chapterId} onChange={(event) => setChapterId(event.target.value)} className={inputCls}>
                  {selectedCourse?.chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      LEVEL {chapter.order} · {cleanChapterTitle(chapter.title)}{chapter.caseCount ? `（已有 ${chapter.caseCount} 个案例）` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {selectedCourse && (
                <div className="mt-2 rounded-2xl bg-neutral-bg px-4 py-3 text-xs leading-6 text-neutral-text">
                  将挂载到：<span className="text-ink">{selectedCourse.title}</span> → {selectedCourse.chapters.find((item) => item.id === chapterId)?.title ?? "（请选择章节）"}
                </div>
              )}
            </div>
          )}

          {pack && attachTarget && (
            <form onSubmit={onAttach} className="mt-5">
              <button
                disabled={busy}
                className="w-full rounded-full bg-gold px-5 py-2.5 text-ink disabled:opacity-60"
              >
                挂载到本章节
              </button>
            </form>
          )}
          {attached && (
            <div className="mt-4 grid gap-2 text-sm">
              <p className="rounded-xl bg-primary-base px-3 py-2 text-ink">
                ✅ 已挂到「{attached.title}」
              </p>
              <a
                href={`/courses/${attached.courseId}/learn/${attached.chapterId}`}
                className="rounded-full bg-sea px-4 py-2 text-center text-white"
              >
                学员视角看案例
              </a>
              <a
                href={`/courses/${attached.courseId}/quiz/${attached.chapterId}`}
                className="rounded-full border border-neutral-border px-4 py-2 text-center text-sm hover:bg-sand"
              >
                去闯关（含新题目）
              </a>
            </div>
          )}
        </div>
      </div>

      {/* 生成结果预览 */}
      {pack && (
        <section className="grid gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="display text-2xl">3 · 成片预览</h2>
            <span className={`rounded-full px-3 py-1 text-xs ${pack.usedAi ? "bg-primary-base text-sea" : "bg-neutral-bg text-neutral-text"}`}>
              {pack.usedAi ? "✨ 大模型精写 · 数字由引擎校验" : "📄 本地参数化模板"}
            </span>
            <span className="rounded-full bg-neutral-bg px-3 py-1 text-xs text-neutral-text">
              学员关卡将展示同款卷宗
            </span>
          </div>

          <CaseDossier
            title={pack.case.title}
            scene={pack.case.scene}
            analysis={pack.case.analysis}
            chips={chips}
            coverEmoji={coverEmoji}
            kicker="实战案例 · 卷宗预览"
          />

          <div className="mt-2 flex items-center gap-2">
            <h3 className="display text-xl">随卷小测</h3>
            <span className="text-xs text-mist">答完这 3 题，才算是真的读懂这单业务</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {pack.questions.map((question, qIndex) => {
              const meta = TYPE_META[question.type] || TYPE_META.single;
              const answersText = question.answer
                .map((index) => String.fromCharCode(65 + index))
                .join(" + ");
              return (
                <article key={qIndex} className={`card rounded-2xl border-t-4 p-4 ${meta.ring}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-bg text-base font-bold text-mist">
                      {String(qIndex + 1).padStart(2, "0")}
                    </div>
                    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.badge}`}>
                      <span aria-hidden>{meta.emoji}</span>
                      {TYPE_LABEL[question.type] || question.type}
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-medium leading-6 text-ink">{question.stem}</p>
                  <ul className="mt-3 grid gap-1.5">
                    {question.options.map((option, oIndex) => {
                      const isCorrect = question.answer.includes(oIndex);
                      return (
                        <li key={oIndex} className="flex items-center gap-2 text-sm leading-6">
                          <span
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] ${
                              isCorrect
                                ? "border-gold bg-gold font-bold text-ink"
                                : "border-neutral-border text-mist"
                            }`}
                          >
                            {isCorrect ? "✓" : String.fromCharCode(65 + oIndex)}
                          </span>
                          <span className={isCorrect ? "font-medium text-ink" : "text-neutral-text"}>{option}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-primary-base px-3 py-1.5 text-xs">
                    <span className="text-mist">标准答案</span>
                    <b className="font-bold text-sea">{answersText}</b>
                  </div>
                  {question.explanation && (
                    <p className="mt-2 text-xs leading-5 text-neutral-text">
                      💡 {question.explanation}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
