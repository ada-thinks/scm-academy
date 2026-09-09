"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { MindNode } from "@/lib/types";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/* —— 横向思维导图布局参数 —— */
const PAD = 36; // 画布留白
const GAP_X = 84; // 父子列水平间距
const GAP_Y = 28; // 兄弟子树之间的最小净间距

/** 各级最大盒宽（根可最宽），超出自动换行、绝不截断 */
const BOX_CAP = [460, 380, 320, 280];
/** 各级字体大小（px） */
const FONT = [14, 13, 12.5, 12];
const LINE_H = 21; // 行高
const PAD_X = 30; // 左右内边距
const PAD_Y = 12; // 上下内边距

/** 估算一段文本在给定字号下的大致像素宽度（中文≈字号，拉丁≈0.55 字号） */
function estWidth(text: string, fontSize: number) {
  let w = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const cjk = ch === "　" || (code >= 0x2e80 && code <= 0x9fff) || (code >= 0xff00 && code <= 0xffef) || code >= 0xac00;
    w += cjk ? fontSize : fontSize * 0.56;
  }
  return w;
}

/** 按文本测量节点盒：能一行放下就一行；放不下则换行并相应加高 */
function measureBox(label: string, depth: number) {
  const cap = BOX_CAP[Math.min(depth, BOX_CAP.length - 1)];
  const font = FONT[Math.min(depth, FONT.length - 1)];
  const raw = estWidth(label, font);
  const contentCap = cap - PAD_X;
  const rows = Math.max(1, Math.ceil(raw / contentCap + 0.12));
  const w = Math.min(raw, cap);
  return {
    w: Math.max(w + PAD_X, 52),
    h: rows * LINE_H + PAD_Y,
    font,
  };
}

const BOX_STYLE = [
  "rounded-full bg-gradient-to-r from-[#1b2f92] to-[#2664fd] font-semibold text-white shadow-lg shadow-sea/25",
  "rounded-2xl border border-[#cfe0ff] bg-white font-semibold text-ink shadow-sm",
  "rounded-full bg-[#edf4ff] font-medium text-[#1d4ed8]",
  "rounded-full bg-[#f2f5fa] text-neutral-text",
];

type LNode = {
  node: MindNode;
  depth: number;
  path: string;
  x: number;
  w: number;
  h: number;
  font: number;
  y: number; // 节点中心纵坐标（绝对）
  rel: number; // 节点中心相对本子树顶部的偏移
  pos?: number; // 节点中心相对父 band 顶部的位置（根节点不需要）
  upper: number; // 子树往上延伸的长度
  lower: number; // 子树往下延伸的长度
  hasKids: boolean;
  collapsed: boolean;
  children: LNode[];
};

/** 自底向上：先给每个子树算轮廓半高，再把兄弟按“上边界+间距+下边界”堆叠，避免交叉 */
function build(node: MindNode, depth: number, path: string, x: number, collapsed: ReadonlySet<string>): LNode {
  const { w, h, font } = measureBox(node.label, depth);
  const isCollapsed = collapsed.has(path);
  const kids = (node.children || []).filter(Boolean);
  const visible = !isCollapsed ? kids : [];

  if (visible.length === 0) {
    return {
      node, depth, path, x, w, h, font,
      y: 0, rel: h / 2, upper: h / 2, lower: h / 2,
      hasKids: kids.length > 0, collapsed: isCollapsed, children: [],
    };
  }

  const children = visible.map((k, i) => build(k, depth + 1, path ? `${path}-${i}` : `${i}`, x + w + GAP_X, collapsed));

  // 计算每个子树中心相对父 band 顶部的位置：上一支下边界 + 间距 + 当前支上边界
  let prevBottom = 0;
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (i === 0) {
      c.pos = c.upper;
    } else {
      c.pos = prevBottom + GAP_Y + c.upper;
    }
    prevBottom = c.pos + c.lower;
  }
  const total = prevBottom;
  const parentCenter = total / 2;

  // 父节点轮廓 = 自身半高 与 各子树相对父中心的延伸 取最大
  let upper = h / 2;
  let lower = h / 2;
  for (const c of children) {
    const dist = Math.abs(parentCenter - c.pos!);
    upper = Math.max(upper, c.upper + dist);
    lower = Math.max(lower, c.lower + dist);
  }

  return {
    node, depth, path, x, w, h, font,
    y: 0, rel: parentCenter, upper, lower,
    hasKids: true, collapsed: isCollapsed, children,
  };
}

/** 把相对坐标落成绝对坐标，并把整棵树整体下移，让最高点贴着画布顶部 */
function place(t: LNode, bandTop: number) {
  t.y = bandTop + t.rel;
  for (const c of t.children) {
    place(c, bandTop + c.pos! - c.upper);
  }
}

function layoutTree(data: MindNode, collapsed: ReadonlySet<string>) {
  const root = build(data, 0, "", 0, collapsed);
  const topOffset = root.upper - root.rel; // 把整棵树最高点对齐 0
  place(root, topOffset);

  let width = 0;
  const walk = (n: LNode) => {
    width = Math.max(width, n.x + n.w);
    n.children.forEach(walk);
  };
  walk(root);

  return { root, width, height: root.upper + root.lower };
}

type CanvasProps = {
  data: MindNode;
  collapsed: ReadonlySet<string>;
  onToggle: (path: string) => void;
};

/** 横向思维导图画布：节点自适应文本、可折叠，SVG 曲线连线 */
function MindCanvas({ data, collapsed, onToggle }: CanvasProps) {
  const { root, width, height } = useMemo(() => layoutTree(data, collapsed), [data, collapsed]);

  // 收集连线（父右缘中点 → 子左缘中点）
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const nodes: LNode[] = [];
  const collect = (t: LNode) => {
    nodes.push(t);
    for (const c of t.children) {
      edges.push({ x1: t.x + t.w, y1: t.y, x2: c.x, y2: c.y });
      collect(c);
    }
  };
  collect(root);

  const W = width + PAD * 2;
  const H = height + PAD * 2;

  return (
    <div className="relative" style={{ width: W, height: H }}>
      {/* 连线层 */}
      <svg className="pointer-events-none absolute inset-0" width={W} height={H} style={{ overflow: "visible" }}>
        {edges.map((e, i) => {
          const x1 = e.x1 + PAD;
          const y1 = e.y1 + PAD;
          const x2 = e.x2 + PAD;
          const y2 = e.y2 + PAD;
          const dx = Math.max(18, (x2 - x1) / 2);
          return (
            <path key={i} d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`} fill="none" stroke="#c0d3f5" strokeWidth={1.6} />
          );
        })}
      </svg>

      {/* 节点层 */}
      {nodes.map((t) => {
        const styleCls = BOX_STYLE[Math.min(t.depth, BOX_STYLE.length - 1)];
        const clickable = t.hasKids;
        return (
          <div
            key={t.path || "root"}
            role={clickable ? "button" : undefined}
            aria-expanded={clickable ? !t.collapsed : undefined}
            onClick={clickable ? () => onToggle(t.path) : undefined}
            className={`absolute flex items-center justify-center px-3.5 text-center [overflow-wrap:anywhere] ${styleCls} ${
              clickable ? "cursor-pointer select-none" : ""
            }`}
            style={{ left: t.x + PAD, top: t.y + PAD - t.h / 2, width: t.w, height: t.h, fontSize: t.font, lineHeight: `${LINE_H}px` }}
            title={t.node.label}
          >
            <span className="block">{t.node.label}</span>
            {t.hasKids && (
              <span
                aria-hidden
                className={`absolute -right-2 -top-2 grid h-[19px] w-[19px] place-items-center rounded-full border text-[11px] font-bold shadow ${
                  t.collapsed
                    ? "border-[#2664fd] bg-[#2664fd] text-white"
                    : "border-[#cfe0ff] bg-white text-[#2664fd]"
                }`}
              >
                {t.collapsed ? "+" : "−"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const btnCls =
  "grid h-8 w-8 place-items-center rounded-full bg-[#e8f2ff] text-base font-bold text-[#2664fd] transition hover:bg-[#d7e6ff] active:scale-90";

export function Mindmap({ data }: { data: MindNode }) {
  const [zoom, setZoom] = useState(1);
  const [open, setOpen] = useState(false);
  const [fullZoom, setFullZoom] = useState(1);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div>
      {/* 卡片内视图 */}
      <div className="relative">
        <div className="overflow-auto rounded-2xl border border-neutral-border/70 bg-[#fbfdff] p-2" style={{ maxHeight: 560 }}>
          <div className="w-max" style={{ zoom }}>
            <MindCanvas data={data} collapsed={collapsed} onToggle={toggle} />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center">
          <span className="pointer-events-auto rounded-full bg-white/85 px-3 py-1 text-[11px] text-neutral-tip backdrop-blur">
            💡 点击分支或其 − / + 圆点可收起/展开
          </span>
        </div>

        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full border border-neutral-border bg-white/95 p-1 shadow-lg shadow-sea/10">
          <button type="button" aria-label="缩小" className={btnCls} onClick={() => setZoom(clamp(zoom / 1.2, 0.5, 1.6))}>
            −
          </button>
          <span className="w-10 text-center text-xs font-semibold tabular-nums text-neutral-text">
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" aria-label="放大" className={btnCls} onClick={() => setZoom(clamp(zoom * 1.2, 0.5, 1.6))}>
            +
          </button>
          <span className="mx-0.5 h-4 w-px bg-neutral-border" aria-hidden />
          <button
            type="button"
            aria-label="全屏查看"
            className="flex h-8 items-center gap-1 rounded-full bg-gradient-to-r from-[#2664fd] to-[#4d85fd] px-3 text-xs font-semibold text-white shadow transition hover:brightness-105 active:scale-95"
            onClick={() => {
              setFullZoom(1);
              setOpen(true);
            }}
          >
            ⛶ 全屏
          </button>
        </div>
      </div>

      {/* 全屏放大弹层 */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex flex-col bg-[#0b1830]/85 p-3 backdrop-blur-sm sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="知识脑图全屏查看"
          >
            <div className="mx-auto flex h-full w-full max-w-6xl min-h-0 flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
              {/* 顶栏 */}
              <div className="flex items-center justify-between gap-3 border-b border-neutral-divider px-4 py-3 sm:px-5">
                <p className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-tip">Mindmap</span>
                  <span className="ml-3 truncate text-sm font-bold text-ink sm:text-base">{data.label}</span>
                </p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" aria-label="缩小" className={btnCls} onClick={() => setFullZoom(clamp(fullZoom / 1.25, 0.5, 2))}>
                    −
                  </button>
                  <span className="w-12 text-center text-xs font-semibold tabular-nums text-neutral-text">
                    {Math.round(fullZoom * 100)}%
                  </span>
                  <button type="button" aria-label="放大" className={btnCls} onClick={() => setFullZoom(clamp(fullZoom * 1.25, 0.5, 2))}>
                    +
                  </button>
                  <button
                    type="button"
                    className="h-8 rounded-full bg-[#e8f2ff] px-3 text-xs font-semibold text-[#2664fd] transition hover:bg-[#d7e6ff] active:scale-95"
                    onClick={() => setFullZoom(1)}
                  >
                    复位
                  </button>
                  <button
                    type="button"
                    aria-label="关闭"
                    className="ml-2 grid h-8 w-8 place-items-center rounded-full bg-[#fde8e4] text-base text-[#f84323] transition hover:bg-[#fbd6cf] active:scale-90"
                    onClick={() => setOpen(false)}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* 画布 */}
              <div className="min-h-0 flex-1 overflow-auto bg-[#fbfdff]">
                <div className="w-max px-2 py-6" style={{ zoom: fullZoom }}>
                  <MindCanvas data={data} collapsed={collapsed} onToggle={toggle} />
                </div>
              </div>

              <p className="border-t border-neutral-divider px-5 py-2 text-center text-[11px] text-neutral-tip">
                点击分支圆点可收起 / 展开 · + / − 缩放 · 复位 · Esc 或 ✕ 关闭
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
