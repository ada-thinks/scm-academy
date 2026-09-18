import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { hasManualFile, loadManualFile } from "./source-store";

/** book/ 目录是放项目资料/源文件的素材目录，旧课程在此有同名源 PDF 时作下载兜底 */
const bookDir = path.join(process.cwd(), "book");

function contentTypeOf(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "text/plain; charset=utf-8";
}

/** 文件名仅允许顶层文件名（防目录穿越），含斜杠一律视为不合法 */
function safeBaseName(name: string) {
  return path.basename(name) === name;
}

/** 实操宝典下载源是否存在：优先已保存的原文件，其次 book/ 同名资料文件兜底 */
export async function hasManualDownload(courseId: string, sourceName: string | null) {
  if (!sourceName) return false;
  if (await hasManualFile(courseId, sourceName)) return true;
  if (!safeBaseName(sourceName)) return false;
  try {
    await stat(path.join(bookDir, sourceName));
    return true;
  } catch {
    return false;
  }
}

export type ManualDownloadFile = {
  buffer: Buffer;
  downloadName: string;
  contentType: string;
};

/** 解析要下发的文件：优先已保存的原文件，旧课程回退 book/ 同名资料 */
export async function resolveManualDownload(
  courseId: string,
  sourceName: string | null,
): Promise<ManualDownloadFile | null> {
  if (!sourceName) return null;
  const saved = await loadManualFile(courseId, sourceName);
  if (saved) {
    return { buffer: saved, downloadName: sourceName, contentType: contentTypeOf(sourceName) };
  }
  if (!safeBaseName(sourceName)) return null;
  try {
    const buffer = await readFile(path.join(bookDir, sourceName));
    return { buffer, downloadName: sourceName, contentType: contentTypeOf(sourceName) };
  } catch {
    return null;
  }
}
