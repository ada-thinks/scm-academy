import Link from "next/link";
import type { MindNode } from "@/lib/types";
import type { ChapterStory } from "@/lib/chapter-story";
import { stripLevelPrefix } from "@/lib/chapter-story";
import { Markdown } from "./Markdown";
import { Mindmap } from "./Mindmap";
import { CaseDossier } from "./CaseDossier";
import { ChapterAnchor, type AnchorItem } from "./ChapterAnchor";
import { PriorityBadge } from "./PriorityBadge";

type JourneyCase = {
  title: string;
  scene: string;
  analysis: string;
  kicker?: string;
  chips?: { label: string; value: string }[];
  coverEmoji?: string;
};

type Props = {
  order: number;
  title: string;
  courseTitle: string;
  courseId: string;
  chapterId: string;
  summary: string;
  coverEmoji: string;
  story: ChapterStory;
  mind: MindNode;
  cases: JourneyCase[];
  questionCount: number;
  passed: boolean;
  /** 本关测验是否仍未解锁（教材可看，但还不能闯关） */
  locked: boolean;
  /** 教材标注优先级（P1～P3），用于展示推荐指数 */
  priority?: string;
};

/** 金句/引言里的 **强调** 在纯文本区只留文字 */
function plain(text: string) {
  return text.replace(/\*\*/g, "").trim();
}

export function ChapterJourney({
  order,
  title,
  courseTitle,
  courseId,
  chapterId,
  summary,
  coverEmoji,
  story,
  mind,
  cases,
  questionCount,
  passed,
  locked,
  priority,
}: Props) {
  const heroTitle = stripLevelPrefix(title);
  const sections = story.sections;
  const heroLead = plain(story.leadBody || summary);

  /* 左侧锚点目录：与下方区块渲染条件保持一致（脑图紧跟开篇） */
  const anchors: AnchorItem[] = [{ id: "jw-hero", tag: "开篇", title: heroTitle }];
  if (sections.length > 0 || mind.children?.length)
    anchors.push({ id: "jw-mind", tag: "图谱", title: "知识图谱速览" });
  sections.forEach((sec, index) => {
    anchors.push({
      id: `jw-sec-${index}`,
      tag: (sec.tag.split("·")[0] || sec.tag).trim(),
      title: sec.title,
    });
  });
  if (story.quote) anchors.push({ id: "jw-quote", tag: "金句", title: "记住一句" });
  if (cases.length) anchors.push({ id: "jw-cases", tag: "实战", title: "实战演练" });

  return (
    <div>
      {/* 左侧章节锚点导轨（xl+ 显示） */}
      <ChapterAnchor items={anchors} />

      {/* ① 标题 + 一句话引言 */}
      <section
        id="jw-hero"
        className="relative mt-5 scroll-mt-24 overflow-hidden rounded-[2rem] p-7 text-white shadow-2xl xl:p-10"
        style={{ background: "linear-gradient(120deg,#1b2f92 0%,#2664fd 52%,#4d85fd 100%)" }}
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border-[26px] border-white/10" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 right-28 h-52 w-52 rounded-full border border-white/15" aria-hidden />
        <div className="pointer-events-none absolute right-16 top-16 h-10 w-10 rounded-2xl bg-white/10" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="text-5xl drop-shadow-sm" aria-hidden>{coverEmoji}</span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/70">
                Level {String(order).padStart(2, "0")} · {courseTitle}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h1 className="display text-3xl font-bold leading-tight xl:text-4xl">{heroTitle}</h1>
                <PriorityBadge priority={priority} className="bg-white/95" />
              </div>
            </div>
          </div>
          <p className="mt-5 max-w-3xl text-[15px] leading-8 text-white/90">{heroLead}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-medium backdrop-blur">
              📖 {sections.length + 1} 段认知主线
            </span>
            <span className="rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-medium backdrop-blur">
              🎯 {questionCount} 道闯关题
            </span>
            {passed && (
              <span className="rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-medium backdrop-blur">
                ⭐ 已通关 · 可复习再刷
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ② 知识图谱速览：紧跟开篇的整体脑图 */}
      {(sections.length > 0 || mind.children?.length) && (
        <section id="jw-mind" className="mx-auto mt-10 max-w-5xl scroll-mt-24">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#e8f2ff] text-lg" aria-hidden>🗺️</span>
            <div>
              <h2 className="text-xl font-bold text-ink">知识图谱速览</h2>
              <p className="text-xs text-neutral-tip">整体脑图</p>
            </div>
          </div>

          {mind.children?.length ? (
            <div className="card rounded-3xl p-5 lg:p-7">
              <Mindmap data={mind} />
            </div>
          ) : null}
        </section>
      )}

      {/* ③-⑥ 自上而下的认知主线，一屏一段 */}
      {sections.length > 0 && (
        <section className="relative mx-auto mt-12 max-w-3xl" aria-label="认知主线">
          {/* 连接轴 */}
          <span className="absolute bottom-6 left-[23px] top-1 w-0.5 rounded-full bg-neutral-divider" aria-hidden />
          <div className="space-y-10">
            {sections.map((sec, index) => (
              <article key={index} id={`jw-sec-${index}`} className="relative scroll-mt-24">
                <div
                  className="absolute left-0 top-0 grid h-12 w-12 place-items-center rounded-2xl border border-neutral-border bg-white text-lg font-extrabold shadow-lg shadow-sea/10"
                  style={{ WebkitBackgroundClip: "text" }}
                  aria-hidden
                >
                  <span className="bg-gradient-to-br from-[#1846d1] to-[#4d85fd] bg-clip-text text-transparent">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="ml-[4.25rem] min-w-0">
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f2ff] px-3 py-1 text-xs font-semibold text-[#2664fd]">
                    <span aria-hidden>{sec.icon}</span>
                    {sec.tag}
                  </p>
                  <h2 className="display mt-3 text-2xl font-bold leading-snug text-ink xl:text-[1.7rem]">
                    {sec.title}
                  </h2>
                  <div className="card mt-4 min-w-0 overflow-x-auto rounded-[1.5rem] px-6 py-5 lg:px-7">
                    <Markdown source={sec.body} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 记住一句 */}
      {story.quote && (
        <section id="jw-quote" className="mx-auto mt-12 max-w-3xl scroll-mt-24">
          <div
            className="relative overflow-hidden rounded-[1.5rem] border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 px-7 py-6"
          >
            <div className="absolute -right-4 -top-5 text-[7rem] leading-none text-amber-200/60 select-none" aria-hidden>
              ”
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-amber-500">记住一句</p>
            <p className="relative mt-2 text-lg font-medium leading-8 text-ink/90">
              <span className="mr-2 text-amber-500" aria-hidden>❝</span>
              {plain(story.quote)}
            </p>
          </div>
        </section>
      )}

      {/* 实战演练（有案例才展示） */}
      {cases.length > 0 && (
        <section id="jw-cases" className="mx-auto mt-14 max-w-5xl scroll-mt-24">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#e8f2ff] text-lg" aria-hidden>🎬</span>
            <div>
              <h2 className="text-xl font-bold text-ink">实战演练</h2>
              <p className="text-xs text-neutral-tip">先看真实冲突怎么拆，再进闯关验证判断</p>
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {cases.map((item, i) => (
              <CaseDossier key={i} {...item} />
            ))}
          </div>
        </section>
      )}

      {/* 闯关 CTA：未解锁的关引导回地图，不提供无效的闯关入口 */}
      <div className="mx-auto mt-14 max-w-3xl pb-4 text-center">
        {locked ? (
          <Link
            href={`/courses/${courseId}`}
            className="inline-flex items-center gap-2 rounded-full bg-neutral-bg px-8 py-3.5 text-base font-semibold text-neutral-disable transition hover:bg-neutral-border/70"
          >
            🔒 通过上一关后解锁
            <span aria-hidden>→</span>
          </Link>
        ) : (
          <Link
            href={`/courses/${courseId}/quiz/${chapterId}`}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-3.5 text-base font-semibold text-white shadow-xl shadow-amber-500/30 transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-amber-500/40"
          >
            {passed ? "复习到位，再闯一次" : "学完了，去闯关"}
            <span aria-hidden>→</span>
          </Link>
        )}
        <p className="mt-3 text-xs text-neutral-tip">
          {locked
            ? "教材可先预习；完成上一关测验后，本关闯关会自动解锁"
            : `一共 ${questionCount} 道题 · 交卷后逐题查看正确答案与解析`}
        </p>
      </div>
    </div>
  );
}
