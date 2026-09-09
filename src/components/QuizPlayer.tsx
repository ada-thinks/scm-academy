"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { submitQuizAction } from "@/lib/actions";

type Question = {
  id: string;
  type: string;
  stem: string;
  options: string[];
};

type DetailItem = {
  type: string;
  stem: string;
  options: string[];
  correctOptions: number[];
  pickedOptions: number[];
  isCorrect: boolean;
  explanation: string;
};

type EarnedAchievement = {
  code: string;
  name: string;
  description: string;
  emoji: string;
  xpReward: number;
};

type Result = {
  score: number;
  passed: boolean;
  stars: number;
  correct: number;
  total: number;
  passScore: number;
  courseId: string;
  detail: DetailItem[];
  xpGain: number;
  xpBonus: number;
  xpTotal: number;
  unlockedNext: { id: string; title: string; order: number } | null;
  achievements: EarnedAchievement[];
};

const TYPE_LABEL: Record<string, string> = {
  single: "单选题",
  multi: "多选题",
  judge: "判断题",
};

function cleanOption(text: string) {
  return text.replace(/^[A-D][.．]\s*/, "");
}

/** 每道题的建议作答秒数：单选/判断 30、多选 45（题目偏长给稍多思考时间） */
function perQuestionSeconds(type: string) {
  if (type === "multi") return 45;
  return 30;
}

function totalSeconds(questions: Question[]) {
  const sum = questions.reduce((n, q) => n + perQuestionSeconds(q.type), 0);
  return Math.min(900, Math.max(90, sum));
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function QuizPlayer({
  chapterId,
  title,
  questions,
}: {
  chapterId: string;
  title: string;
  questions: Question[];
}) {
  const router = useRouter();
  const total = useMemo(() => totalSeconds(questions), [questions]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number[][]>(() => questions.map(() => []));
  const [secondsLeft, setSecondsLeft] = useState(total);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  // 错题重练：进入本地复习会话（不重复计分、不加经验）
  const [showReview, setShowReview] = useState(false);

  const pickedRef = useRef(picked);
  const busyRef = useRef(false);
  const autoFiredRef = useRef(false);

  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);

  const current = questions[index];
  const done = useMemo(() => picked.every((row, i) => row.length > 0 || questions[i].type === "multi"), [picked, questions]);

  // 整关倒计时：结算前每秒递减，归零后自动交卷
  useEffect(() => {
    if (result) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [result]);

  // 时间到：自动提交当前已选答案
  useEffect(() => {
    if (result || secondsLeft > 0 || busyRef.current || autoFiredRef.current) return;
    autoFiredRef.current = true;
    busyRef.current = true;
    const answers = pickedRef.current;
    setError("");
    start(async () => {
      try {
        const res = await submitQuizAction(chapterId, answers);
        if ("error" in res && res.error) {
          setError(`${res.error}（时间已到，可点「立即交卷」重试）`);
          autoFiredRef.current = false;
          return;
        }
        if (res.ok) {
          setResult(res);
          router.refresh(); // 同步刷新顶栏 XP 等服务端数据
        }
      } finally {
        busyRef.current = false;
      }
    });
  }, [secondsLeft, result, chapterId, router]);

  function toggle(optionIndex: number) {
    setPicked((prev) => {
      const next = prev.map((row) => [...row]);
      const row = next[index];
      if (current.type === "multi") {
        next[index] = row.includes(optionIndex)
          ? row.filter((n) => n !== optionIndex)
          : [...row, optionIndex];
      } else {
        next[index] = [optionIndex];
      }
      return next;
    });
  }

  function submit() {
    if (busyRef.current || pending) return;
    busyRef.current = true;
    setError("");
    const answers = pickedRef.current;
    start(async () => {
      try {
        const res = await submitQuizAction(chapterId, answers);
        if ("error" in res && res.error) {
          setError(res.error);
          return;
        }
        if (res.ok) {
          setResult(res);
          router.refresh(); // 同步刷新顶栏 XP 等服务端数据
        }
      } finally {
        busyRef.current = false;
      }
    });
  }

  function retry() {
    setResult(null);
    setError("");
    setIndex(0);
    setSecondsLeft(total);
    autoFiredRef.current = false;
    busyRef.current = false;
    setPicked(questions.map(() => []));
  }

  // 错题重练视图：从本次答卷的错题抽题，重新作答后即时对照答案与解析
  if (result && showReview) {
    const wrong = result.detail.filter((d) => !d.isCorrect);
    return <WrongReview items={wrong} onExit={() => setShowReview(false)} />;
  }

  if (result) {
    const timerEnded = secondsLeft === 0;
    return (
      <div>
        <div className="card mx-auto max-w-2xl rounded-3xl p-8 text-center">
          <p className="text-5xl">{result.passed ? "🎉" : "🌧️"}</p>
          <h2 className="display mt-3 text-3xl">
            {result.passed ? "过关！" : "还差一口气"}
          </h2>
          <p className="mt-2 text-neutral-text">
            {result.correct}/{result.total} 题正确 · {result.score} 分 · 合格线：{result.passScore}
            {timerEnded && " · ⏰ 时间到自动交卷"}
          </p>
          <p className="mt-3 text-2xl text-gold">{"★".repeat(result.stars)}{"☆".repeat(3 - result.stars)}</p>
          <p className="mt-2 text-sea">
            经验 +{result.xpGain + result.xpBonus}
            {result.xpBonus > 0 && `（答题 +${result.xpGain}，成就奖励 +${result.xpBonus}）`}
          </p>
          <p className="mt-1 text-xs text-mist">当前总经验 {result.xpTotal}</p>

          {result.achievements.length > 0 && (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 text-left">
              <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">
                🎉 新解锁成就
              </p>
              <div className="mt-3 space-y-2.5">
                {result.achievements.map((a) => (
                  <div key={a.code} className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-xl shadow-sm" aria-hidden>
                      {a.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{a.name}</p>
                      <p className="truncate text-xs text-neutral-text">{a.description}</p>
                    </div>
                    {a.xpReward > 0 && (
                      <span className="shrink-0 text-xs font-bold text-emerald-600">+{a.xpReward} XP</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.unlockedNext && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[#2664fd]/20 bg-[#e8f2ff] px-4 py-3 text-left">
              <span aria-hidden>🔓</span>
              <p className="text-sm font-medium text-ink">
                已解锁下一关：<span className="font-semibold">{result.unlockedNext.title}</span>
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {result.passed ? (
              <button
                onClick={() => router.push(`/courses/${result.courseId}`)}
                className="rounded-full bg-sea px-5 py-2 text-white"
              >
                下一关地图
              </button>
            ) : (
              <button
                onClick={retry}
                className="rounded-full bg-coral px-5 py-2 text-white"
              >
                再战一局
              </button>
            )}
            {result.correct < result.total && (
              <button
                onClick={() => setShowReview(true)}
                className="rounded-full border border-sea bg-white px-5 py-2 text-sea transition-colors hover:bg-sand"
              >
                错题重练（{result.total - result.correct} 题）
              </button>
            )}
          </div>
        </div>

        {/* 逐题解析：正确答案 + 解析 */}
        <div className="mx-auto mt-6 max-w-2xl space-y-4">
          <h3 className="display text-2xl text-ink">逐题解析</h3>
          {result.detail.map((d, i) => (
            <div key={i} className="card rounded-3xl p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium leading-relaxed">
                  第 {i + 1} 题 · {TYPE_LABEL[d.type] || d.type}
                  <span
                    className="ml-2 text-xs"
                    style={{ color: d.isCorrect ? "#15803d" : "#b91c1c" }}
                  >
                    {d.isCorrect ? "✓ 答对了" : "✗ 答错了"}
                  </span>
                </p>
              </div>
              <p className="mt-1 text-neutral-text">{d.stem}</p>
              <div className="mt-3 space-y-2">
                {d.options.map((option, oi) => {
                  const pickedIt = d.pickedOptions.includes(oi);
                  const rightIt = d.correctOptions.includes(oi);
                  const label = String.fromCharCode(65 + oi);
                  let box: CSSProperties = {};
                  let note = "";
                  if (pickedIt && rightIt) {
                    box = { borderColor: "#22c55e", background: "#eafaf1" };
                    note = "✓ 你答对了";
                  } else if (pickedIt && !rightIt) {
                    box = { borderColor: "#f87171", background: "#fef2f2" };
                    note = "✗ 你选的";
                  } else if (!pickedIt && rightIt) {
                    box = { borderColor: "#86efac", background: "#f0fdf4" };
                    note = "正确答案";
                  } else {
                    box = { borderColor: "#e2e8f0", background: "#fff" };
                  }
                  return (
                    <div
                      key={oi}
                      className="flex items-start gap-3 rounded-2xl border px-4 py-3"
                      style={box}
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-medium text-mist">
                        {label}
                      </span>
                      <span className="flex-1 leading-relaxed">{cleanOption(option)}</span>
                      {note && (
                        <span
                          className="shrink-0 text-xs"
                          style={{ color: pickedIt && !rightIt ? "#b91c1c" : "#15803d" }}
                        >
                          {note}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {d.explanation && (
                <div
                  className="mt-3 rounded-2xl border-l-4 px-4 py-3 text-sm leading-relaxed text-neutral-text"
                  style={{ borderColor: "#38bdf8", background: "#f0f9ff" }}
                >
                  <span className="font-medium text-ink">解析：</span>
                  {d.explanation}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const lowTime = secondsLeft <= 60;
  return (
    <div className="card mx-auto max-w-2xl rounded-3xl p-8">
      <div className="flex items-center justify-between text-sm">
        <span className="text-mist">{title}</span>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 font-medium tabular-nums ${
              lowTime ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-600"
            }`}
          >
            ⏱ {formatTime(secondsLeft)}
          </span>
          <span className="text-mist">
            {index + 1} / {questions.length}
          </span>
        </div>
      </div>
      <div className="xp-bar mt-3 h-2 rounded-full">
        <span style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>
      <h2 className="mt-6 text-xl font-medium leading-relaxed">{current.stem}</h2>
      <p className="mt-2 text-xs text-mist">
        {TYPE_LABEL[current.type] || current.type}
        {current.type === "multi" ? "，可选多个" : ""}
        {" · "}
        {perQuestionSeconds(current.type)} 秒/题
        {lowTime && " · ⏰ 时间不多了"}
      </p>
      <div className="mt-5 grid gap-3">
        {current.options.map((option, optionIndex) => {
          const active = picked[index].includes(optionIndex);
          const label = String.fromCharCode(65 + optionIndex);
          const text = cleanOption(option);
          return (
            <button
              key={optionIndex}
              onClick={() => toggle(optionIndex)}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                active ? "border-sea bg-sand" : "border-neutral-border bg-white hover:border-sea"
              }`}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-medium ${
                  active ? "border-sea bg-sea text-white" : "border-neutral-border bg-white text-mist"
                }`}
              >
                {label}
              </span>
              <span className="flex-1 leading-relaxed">{text}</span>
            </button>
          );
        })}
      </div>
      {secondsLeft === 0 && !result && !error && (
        <p className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-coral/10 px-3 py-2 text-sm font-medium text-coral">
          ⏰ 时间到，正在自动交卷…
        </p>
      )}
      {error && <p className="mt-4 text-sm text-coral">{error}</p>}
      <div className="mt-6 flex items-center justify-between">
        <button
          disabled={index === 0}
          onClick={() => setIndex((v) => v - 1)}
          className="rounded-full px-4 py-2 text-neutral-tip disabled:opacity-40"
        >
          上一题
        </button>
        {index < questions.length - 1 && secondsLeft > 0 ? (
          <button
            onClick={() => setIndex((v) => v + 1)}
            className="rounded-full bg-sea px-5 py-2 text-white"
          >
            下一题
          </button>
        ) : (
          <button
            disabled={pending}
            onClick={submit}
            className="rounded-full bg-gold px-5 py-2 text-ink disabled:opacity-60"
          >
            {pending ? "结算中…" : secondsLeft === 0 ? "立即交卷" : done ? "提交闯关" : "直接交卷"}
          </button>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-mist">
        最后一题后提交即可查看每题的正确答案与解析；倒计时结束会自动交卷
      </p>
    </div>
  );
}

/** 错题重练：从本关错题抽题再练，本地即时对照答案与解析（不重复计分、不加经验） */
function WrongReview({ items, onExit }: { items: DetailItem[]; onExit: () => void }) {
  const [index, setIndex] = useState(0);
  // 默认带入本次的作答，方便先看自己错在哪，再调整
  const [picked, setPicked] = useState<number[][]>(() => items.map((d) => [...d.pickedOptions]));
  const [revealed, setRevealed] = useState(false);

  if (items.length === 0) return null;

  const item = items[index];
  const pickedNow = picked[index] || [];
  const isMulti = item.type === "multi";

  function toggle(optionIndex: number) {
    if (revealed) return;
    setPicked((prev) => {
      const next = prev.map((row) => [...row]);
      const row = next[index];
      if (isMulti) {
        next[index] = row.includes(optionIndex)
          ? row.filter((n) => n !== optionIndex)
          : [...row, optionIndex];
      } else {
        next[index] = [optionIndex];
      }
      return next;
    });
  }

  function go(to: number) {
    setIndex(to);
    setRevealed(false);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={onExit} className="text-sm text-sea">
        ← 返回结算
      </button>
      <div className="card mt-3 rounded-3xl p-6">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium text-coral">📖 错题重练 · 共 {items.length} 题</span>
          <span className="shrink-0 text-mist">
            {index + 1} / {items.length} · {TYPE_LABEL[item.type] || item.type}
          </span>
        </div>
        <h2 className="mt-4 text-lg font-medium leading-relaxed text-ink">{item.stem}</h2>
        <p className="mt-1 text-xs text-neutral-tip">
          已带入你这次的作答，可以重新调整；答完再点「看答案与解析」对照
        </p>
        <div className="mt-4 grid gap-3">
          {item.options.map((option, oi) => {
            const active = pickedNow.includes(oi);
            const rightIt = item.correctOptions.includes(oi);
            const label = String.fromCharCode(65 + oi);
            let box: CSSProperties =
              active
                ? { borderColor: "#2664fd", background: "#f3f7ff" }
                : { borderColor: "#e2e8f0", background: "#fff" };
            let note = "";
            if (revealed) {
              if (rightIt) {
                box = { borderColor: "#22c55e", background: "#eafaf1" };
                note = active ? "✓ 你答对了" : "正确答案";
              } else if (active) {
                box = { borderColor: "#f87171", background: "#fef2f2" };
                note = "✗ 再想想";
              }
            }
            return (
              <button
                key={oi}
                onClick={() => toggle(oi)}
                className="flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition disabled:opacity-100"
                style={box}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-medium ${
                    active ? "border-sea bg-sea text-white" : "border-neutral-border bg-white text-mist"
                  }`}
                >
                  {label}
                </span>
                <span className="flex-1 leading-relaxed">{cleanOption(option)}</span>
                {note && (
                  <span className="shrink-0 text-xs" style={{ color: rightIt ? "#15803d" : "#b91c1c" }}>
                    {note}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {revealed && (
          <div
            className="mt-4 rounded-2xl border-l-4 px-4 py-3 text-sm leading-relaxed text-neutral-text"
            style={{ borderColor: "#38bdf8", background: "#f0f9ff" }}
          >
            <span className="font-medium text-ink">解析：</span>
            {item.explanation || "参考答案已在上方标绿。"}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <button
            disabled={index === 0}
            onClick={() => go(index - 1)}
            className="rounded-full px-4 py-2 text-neutral-tip disabled:opacity-40"
          >
            上一题
          </button>
          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              className="rounded-full bg-gold px-5 py-2 text-ink"
            >
              看答案与解析
            </button>
          ) : index < items.length - 1 ? (
            <button
              onClick={() => go(index + 1)}
              className="rounded-full bg-sea px-5 py-2 text-white"
            >
              下一题
            </button>
          ) : (
            <button onClick={onExit} className="rounded-full bg-sea px-5 py-2 text-white">
              完成回顾
            </button>
          )}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-mist">
        回顾不计成绩、不加经验；想重刷整关拿更高分，回结算页点「再战一局」
      </p>
    </div>
  );
}
