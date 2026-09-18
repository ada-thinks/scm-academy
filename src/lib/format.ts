export function cleanChapterTitle(title: string): string {
  return title.replace(/^第\s*\d+\s*关\s*[·•]\s*/i, "").trim();
}

export function chapterDisplayTitle(order: number, title: string): string {
  return `第 ${order} 关 · ${cleanChapterTitle(title)}`;
}

/** 教材标注优先级（P1～P3）对应的推荐指数星级；无标注返回空 */
export function priorityStars(priority?: string | null): string {
  const level = String(priority || "").trim().toUpperCase();
  if (level === "P1") return "⭐⭐⭐";
  if (level === "P2") return "⭐⭐";
  if (level === "P3") return "⭐";
  return "";
}

/** 教材标注优先级对应的推荐语：P1 最重点、最推荐学习 */
export function priorityTip(priority?: string | null): string {
  const level = String(priority || "").trim().toUpperCase();
  if (level === "P1") return "P1 · 最重点，最推荐学习";
  if (level === "P2") return "P2 · 重点";
  if (level === "P3") return "P3 · 了解";
  return "";
}
