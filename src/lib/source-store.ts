import { access, mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
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
  await deleteManualFile(courseId);
}

/* ---------------- 操作手册原始文件（上传时保留一份，供实操宝典页下载源文件） ---------------- */

const manualFileDir = path.join(process.cwd(), "data", "manuals");

/** 按上传文件名映射为安全扩展名：pdf/docx/md（txt/markdown 落为 md） */
function manualFileExtOf(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  return "md";
}

const manualFile = (courseId: string, filename: string) =>
  path.join(manualFileDir, `${courseId}.manual.${manualFileExtOf(filename)}`);

export async function saveManualFile(courseId: string, filename: string, buffer: Buffer) {
  await mkdir(manualFileDir, { recursive: true });
  await writeFile(manualFile(courseId, filename), buffer);
}

export async function hasManualFile(courseId: string, filename: string) {
  try {
    await access(manualFile(courseId, filename));
    return true;
  } catch {
    return false;
  }
}

export async function loadManualFile(courseId: string, filename: string) {
  try {
    return await readFile(manualFile(courseId, filename));
  } catch {
    return null;
  }
}

/** 删除某课程保存的全部手册原文件（含各种扩展名） */
export async function deleteManualFile(courseId: string) {
  try {
    const names = await readdir(manualFileDir);
    await Promise.all(
      names
        .filter((name) => name.startsWith(`${courseId}.manual.`))
        .map((name) => unlink(path.join(manualFileDir, name)).catch(() => {})),
    );
  } catch {
    // data/manuals 不存在也视为清理完成
  }
}
