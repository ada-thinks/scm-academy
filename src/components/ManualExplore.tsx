"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, CircleDot } from "lucide-react";

export type ManualStepData = {
  order: number;
  kind: string;
  actor: string;
  title: string;
  detail: string;
};

export type ManualFlowData = {
  id: string;
  order: number;
  title: string;
  goal: string;
  steps: ManualStepData[];
};

type Props = {
  flows: ManualFlowData[];
};

/** 角色标签配色与图标 */
function actorBadge(actor: string) {
  if (actor.includes("内管")) return { cls: "bg-sand text-sea", emoji: "💻" };
  if (actor.includes("资金方")) return { cls: "bg-amber-50 text-amber-600", emoji: "🏦" };
  if (actor.includes("核心企业")) return { cls: "bg-emerald-50 text-emerald-600", emoji: "🏢" };
  if (actor.includes("客户端")) return { cls: "bg-sky-50 text-sky-600", emoji: "👤" };
  return { cls: "bg-neutral-bg text-neutral-tip", emoji: "⚙️" };
}

export function ManualExplore({ flows }: Props) {
  const [flowId, setFlowId] = useState(flows[0]?.id ?? "");
  const [stepIndex, setStepIndex] = useState(0);

  const flow = flows.find((f) => f.id === flowId) ?? flows[0];
  if (!flow) return null;
  const activeStep = flow.steps[Math.min(stepIndex, flow.steps.length - 1)];

  return (
    <div className="mt-5 grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
      {/* —— 左侧：流程目录 —— */}
      <aside className="card rounded-3xl p-3 lg:sticky lg:top-6">
        <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-widest text-mist">
          流程目录
        </p>
        <nav className="grid gap-1.5">
          {flows.map((f) => {
            const active = f.id === flow.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setFlowId(f.id);
                  setStepIndex(0);
                }}
                className={
                  active
                    ? "flex items-start gap-2.5 rounded-2xl bg-sand px-3 py-2.5 text-left"
                    : "flex items-start gap-2.5 rounded-2xl px-3 py-2.5 text-left transition hover:bg-neutral-bg/70"
                }
              >
                <span
                  className={
                    active
                      ? "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sea text-[11px] font-semibold text-white"
                      : "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-bg text-[11px] font-semibold text-neutral-tip"
                  }
                >
                  {f.order}
                </span>
                <span
                  className={
                    active ? "text-sm font-semibold leading-5 text-ink" : "text-sm leading-5 text-neutral-text"
                  }
                >
                  {f.title}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* —— 右侧：当前流程 —— */}
      <section>
        <div className="card rounded-3xl p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-sea">
            FLOW {flow.order}
          </p>
          <h2 className="display mt-1 text-2xl text-ink">{flow.title}</h2>
          {flow.goal && (
            <p className="mt-2 rounded-2xl bg-amber-50 px-4 py-2.5 text-sm leading-6 text-amber-800">
              🎯 {flow.goal}
            </p>
          )}

          {/* 流程图：横排步骤节点 */}
          <div className="mt-5 overflow-x-auto pb-1">
            <ol className="flex min-w-max items-center gap-2">
              {flow.steps.map((step, index) => (
                  <li key={step.order} className="flex items-center gap-2">
                    {index > 0 && <ChevronRight size={18} className="shrink-0 text-neutral-disable" />}
                    <button
                      type="button"
                      onClick={() => setStepIndex(index)}
                      className={
                        index === stepIndex
                          ? "rounded-2xl border-2 border-sea bg-sand/60 px-3.5 py-2.5 text-left shadow-sm transition"
                          : "rounded-2xl border border-neutral-border bg-white px-3.5 py-2.5 text-left transition hover:border-sea/50"
                      }
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={
                            step.kind === "end"
                              ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white"
                              : index === stepIndex
                                ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sea text-xs font-bold text-white"
                                : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-sea ring-1 ring-sea/40"
                          }
                        >
                          {step.kind === "end" ? "✓" : step.order}
                        </span>
                        <span className="max-w-[9.5rem] text-sm font-semibold leading-snug text-ink">
                          {step.title}
                        </span>
                      </span>
                      <span className="mt-1.5 flex items-center gap-1">
                        {step.actor && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${actorBadge(step.actor).cls}`}
                          >
                            {actorBadge(step.actor).emoji} {step.actor}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
            </ol>
          </div>

          {/* 步骤明细：选中的节点展开操作步骤 */}
          {activeStep && (
            <div className="mt-5 rounded-2xl border border-neutral-border/70 bg-neutral-card/50 p-5">
              <div className="flex items-center gap-2">
                <CircleDot size={15} className="text-sea" />
                <span className="text-xs font-semibold uppercase tracking-widest text-neutral-tip">
                  操作步骤 {String(activeStep.order).padStart(2, "0")}
                </span>
                {activeStep.actor && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${actorBadge(activeStep.actor).cls}`}
                  >
                    {actorBadge(activeStep.actor).emoji} {activeStep.actor}
                  </span>
                )}
              </div>
              <h3 className="mt-1.5 text-lg font-semibold text-ink">{activeStep.title}</h3>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-mist">
                <ChevronDown size={13} />
                点击上方流程节点可切换查看其它步骤
              </div>
              {activeStep.detail && (
                <ol className="mt-3 space-y-2.5">
                  {activeStep.detail.split(/\n+/).filter(Boolean).map((line, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-6 text-neutral-text">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-sea/70" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
