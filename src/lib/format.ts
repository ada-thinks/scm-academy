export function cleanChapterTitle(title: string): string {
  return title.replace(/^第\s*\d+\s*关\s*[·•]\s*/i, "").trim();
}

export function chapterDisplayTitle(order: number, title: string): string {
  return `第 ${order} 关 · ${cleanChapterTitle(title)}`;
}
