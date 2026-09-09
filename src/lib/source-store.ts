import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const dir = path.join(process.cwd(), "data", "sources");

export async function saveSource(courseId: string, text: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${courseId}.txt`), text, "utf8");
}

export async function loadSource(courseId: string) {
  try {
    return await readFile(path.join(dir, `${courseId}.txt`), "utf8");
  } catch {
    return "";
  }
}

export async function hasSource(courseId: string) {
  return Boolean(await loadSource(courseId));
}

export async function deleteSource(courseId: string) {
  try {
    await unlink(path.join(dir, `${courseId}.txt`));
  } catch {
    // 源文件不存在也视为清理完成
  }
}

/* ---------------- 操作手册原文（同一门业务课程的第二份文档） ---------------- */

const manualPath = (courseId: string) => path.join(dir, `${courseId}.manual.txt`);

export async function saveManualSource(courseId: string, text: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(manualPath(courseId), text, "utf8");
}

export async function loadManualSource(courseId: string) {
  try {
    return await readFile(manualPath(courseId), "utf8");
  } catch {
    return "";
  }
}

export async function hasManualSource(courseId: string) {
  return Boolean(await loadManualSource(courseId));
}

export async function deleteManualSource(courseId: string) {
  try {
    await unlink(manualPath(courseId));
  } catch {
    // 不存在也视为清理完成
  }
}
