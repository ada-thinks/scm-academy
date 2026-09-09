"use client";

import { useEffect, useRef, useState } from "react";

export type AnchorItem = {
  id: string;
  tag: string;
  title: string;
};

/**
 * 章节页左侧纵向锚点导轨：
 * - 平时只露出一列小圆点 + 中轴连线，不占视觉；
 * - 鼠标悬停某一节时，才在右侧浮出该节标签与标题；
 * - 点击平滑滚动到对应区块；
 * - 跟随滚动高亮「当前所在节」。
 */
export function ChapterAnchor({ items }: { items: AnchorItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const itemsRef = useRef(items);
  // 用 effect 同步最新章节列表，避免渲染期写 ref（React 19 规则）
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    let raf = 0;
    const compute = () => {
      raf = 0;
      const list = itemsRef.current;
      if (!list.length) return;
      const probe = window.innerHeight * 0.3;
      let current = list[0].id;
      for (const it of list) {
        const el = document.getElementById(it.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - 64 <= probe) current = it.id;
      }
      setActive((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    compute();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll, { passive: true });
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const jump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <nav
      aria-label="本页章节导航"
      className="fixed left-4 top-1/2 z-10 hidden -translate-y-1/2 xl:block"
    >
      <div className="relative flex flex-col items-start py-1">
        {/* 竖向中轴 */}
        <span
          aria-hidden
          className="absolute bottom-4 left-[5px] top-4 w-px bg-neutral-divider"
        />
        {items.map((it) => {
          const on = active === it.id;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => jump(it.id)}
              aria-current={on ? "true" : undefined}
              className="group relative flex items-center px-3 py-[7px]"
            >
              {/* 常态小圆点 */}
              <span
                aria-hidden
                className={`relative z-[1] h-[11px] w-[11px] rounded-full border-2 transition-all duration-300 ${
                  on
                    ? "border-[#2664fd] bg-[#2664fd] ring-4 ring-[#2664fd]/15"
                    : "border-[#b9cdf7] bg-white group-hover:border-[#2664fd]"
                }`}
              />
              {/* hover 浮出的标题卡 */}
              <span className="pointer-events-none absolute left-9 top-1/2 -translate-x-1 -translate-y-1/2 scale-95 whitespace-nowrap rounded-2xl border border-neutral-border bg-white py-2 pl-3.5 pr-4 opacity-0 shadow-xl shadow-sea/10 transition-all duration-200 group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100">
                <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[#2664fd]">
                  {it.tag}
                </span>
                <span className="mt-0.5 block max-w-[15rem] truncate text-sm font-semibold text-ink">
                  {it.title}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
