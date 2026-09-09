import mammoth from "mammoth";

export async function extractText(filename: string, buffer: Buffer) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".doc") && !lower.endsWith(".docx")) {
    throw new Error("旧版 .doc 还不支持，请在 Word 里另存为 .docx 后再上传。");
  }
  try {
    if (lower.endsWith(".md") || lower.endsWith(".txt") || lower.endsWith(".markdown")) {
      return buffer.toString("utf8");
    }
    if (lower.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    if (lower.endsWith(".pdf")) {
      const { extractText: extractPdf, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractPdf(pdf, { mergePages: true });
      return Array.isArray(text) ? text.join("\n") : String(text || "");
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    if (/central directory|zip file/i.test(raw)) {
      throw new Error("这个 Word 文件打不开。请另存为 .docx（不要用旧版 .doc）后再试。");
    }
    throw error;
  }
  throw new Error("暂不支持该文件类型，请上传 .md / .txt / .pdf / .docx");
}

export function sourceTypeOf(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  return "md";
}
