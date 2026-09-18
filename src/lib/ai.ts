import { jsonrepair } from "jsonrepair";
import type { GeneratedCourse, GeneratedChapter, GeneratedQuestion } from "./types";
import { prisma } from "./prisma";
import { COURSE_RULES_V1_1 } from "./course-rules";
import {
  GOLD_BOOK_STYLE,
  GOLD_STYLE,
  cleanPdfText,
  isManual,
  splitBookSections,
  splitByTopChapters,
  teachChapter,
  stripCasesFromNotes,
} from "./teach";

type AiSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export async function loadAiSettings(): Promise<AiSettings> {
  const rows = await prisma.appSetting.findMany();
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    apiKey: map.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "",
    baseUrl: map.OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: map.OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
  };
}

export function hasAi(settings: AiSettings) {
  return Boolean(settings.apiKey && settings.apiKey.trim());
}

/** AI 生成的阶段进度：planning=拆大纲，writing=逐关精讲（done/total） */
export type GenerationStage =
  | { stage: "planning" }
  | { stage: "writing"; done: number; total: number };

/** 按“一级标题 = 一个关卡”从全文切出的固定大纲：标题/小节都取自原文，不由大模型自由发挥 */
type LocalSection = { title: string; body: string; priority?: string };

function localOutline(rawText: string, filename: string) {
  let sections: LocalSection[] = splitByTopChapters(rawText);
  if (!sections.length) {
    sections = [{ title: guessTitle(filename, rawText), body: rawText.slice(0, 5000), priority: "" }];
  }
  const titles = sections.map((s) => s.title).filter(Boolean);
  const preview = titles.slice(0, 3).map((t) => `「${t}」`).join("、");
  const more = titles.length > 3 ? "等主题" : "";
  const description = `本课按教材一级章节拆为 ${titles.length} 关：${preview}${more}，涵盖核心概念、操作流程与案例。`;
  return {
    title: guessTitle(filename, rawText),
    description,
    coverEmoji: "📘",
    sections,
  };
}

export async function generateCourseWithAi(
  rawText: string,
  filename: string,
  onProgress?: (p: GenerationStage) => void,
): Promise<GeneratedCourse> {
  const settings = await loadAiSettings();
  if (!hasAi(settings)) throw new Error("NO_AI");

  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl.replace(/\/$/, ""),
    timeout: 120000,
  });

  const outline = localOutline(rawText, filename);
  const chapters: GeneratedChapter[] = [];
  for (const [index, section] of outline.sections.entries()) {
    // 传整段一级标题正文；AI 自己按小章节组织笔记与脑图
    const cleaned = cleanPdfText(section.body);
    const slice = cleaned.slice(0, 8000);
    const subs = splitBookSections(cleaned);
    const manual = isManual(`${section.title}\n${cleaned.slice(0, 1600)}`);
    const style = manual ? GOLD_STYLE : GOLD_BOOK_STYLE;
    try {
      onProgress?.({ stage: "writing", done: index, total: outline.sections.length });
      const sourceBlock = subs.length
        ? `下面按教材小章节给出原文（共 ${subs.length} 节），小节名必须沿用，不要自创：\n\n${subs
            .map((s, i) => `〔小节 ${i + 1}〕${s.label}\n${s.body}`)
            .join("\n\n")}`
        : `本关教材原文：\n${slice}`;
      const commonSystem = `${style}\n\n${COURSE_RULES_V1_1}\n\n现在只写这一关（教材中的一个一级章节）。内容必须忠实本关教材原文，禁止套用别的业务或编造没讲过的内容。只输出 JSON。`;

      // 拆成两次调用：笔记+脑图 与 案例+题目。单次输出都在上限内，避免长 JSON 被截断
      const notePart = await chatJson<GeneratedChapter>(
        client,
        settings.model,
        [
          { role: "system", content: `${commonSystem}这一步只写「笔记 + 脑图」。` },
          {
            role: "user",
            content: `这是学习宝典第 ${index + 1} 关，对应教材大章节：「${section.title}」。\n${sourceBlock}\n\n请输出 JSON：{"title","summary","notesMd","mindmap":{"id","label","children":[{"id","label","children":[]}]}}\n${
              subs.length
                ? "notesMd 中每个小节写一个「### 小节号+标题」独立小节，顺序与原文一致；mindmap 一级 children 对应上面各小节名。\n"
                : ""
            }mindmap 节点的 label 请用简短完整的短语（约 16 字内），禁止用省略号「…」截断成不完整的半句。`,
          },
        ],
        0.45,
      );

      const quizPart = await chatJson<GeneratedChapter>(
        client,
        settings.model,
        [
          { role: "system", content: `${commonSystem}这一步只写「案例 + 通关小测」。每题必须有 stem。` },
          {
            role: "user",
            content: `这是学习宝典第 ${index + 1} 关，对应教材大章节：「${section.title}」。\n${sourceBlock}\n\n本关笔记要点（供出题参考）：\n${(notePart.notesMd || "").slice(0, 2500)}\n\n请输出 JSON：{"cases":[{"title","scene","analysis"}],"questions":[{"type":"single","stem":"题干","options":["A","B","C","D"],"answer":[0],"explanation":"..."}]}\ncases 写 0～2 个假设的真实交易案例（主角+金额/账期+决策点）；不合适就给空数组。\nquestions 必须 5 道，每题都有 stem。配比 2 single、1 multi、2 judge（judge 的 options 固定为 ["正确","错误"]）。`,
          },
        ],
        0.5,
      );

      const chapter: GeneratedChapter = {
        ...notePart,
        cases: quizPart.cases ?? [],
        questions: quizPart.questions ?? [],
      };
      chapters.push(polishChapter(chapter, index, slice, filename, section.title));
    } catch (error) {
      console.error(error);
      chapters.push(teachChapter(index, section.title, slice, filename, section.priority));
    }
  }
  // 教材章节标题里的优先级（如第四章 业务流程详解（优先级P1））按大纲顺序回填到各关
  for (let i = 0; i < chapters.length; i++) {
    const sec = outline.sections[i];
    if (sec?.priority && !chapters[i].priority) chapters[i].priority = sec.priority;
  }

  return {
    title: outline.title,
    description: outline.description,
    coverEmoji: outline.coverEmoji,
    chapters,
  };
}

export function generateCourseLocally(rawText: string, filename: string): GeneratedCourse {
  const outline = localOutline(rawText, filename);
  const chapters = outline.sections.map((section, index) =>
    teachChapter(index, section.title, section.body, filename, section.priority),
  );
  return {
    title: outline.title,
    description: outline.description,
    coverEmoji: outline.coverEmoji,
    chapters,
  };
}

function polishChapter(
  input: GeneratedChapter,
  index: number,
  source: string,
  filename: string,
  sourceTitle?: string,
): GeneratedChapter {
  // 关卡标题一律取教材章节名，不由模型自由发挥——否则会出现「第 3 关 · 3 交易发生过程」这类串号
  const fallback = teachChapter(index, sourceTitle || `第 ${index + 1} 关`, source, filename);
  const notes = (input.notesMd || "").trim();
  const questions = normalizeQuestions(input.questions, fallback.questions);
  // 只要是一段像样的 Markdown 笔记就采用 AI 结果；
  // 不要用「是否包含『这一关』」判断——模型会按小章节直接以「## 1.1 …」开头，那样会被误判成失败
  const hasNotes = notes.length >= 280 && /^#{1,3}\s/m.test(notes);
  return {
    title: fallback.title,
    summary: input.summary || fallback.summary,
    notesMd: stripCasesFromNotes(hasNotes ? notes : fallback.notesMd),
    mindmap: input.mindmap?.label ? input.mindmap : fallback.mindmap,
    cases: (input.cases || []).length >= 1 ? input.cases.slice(0, 2) : fallback.cases,
    questions,
  };
}

function normalizeQuestions(input: GeneratedQuestion[] | undefined, fallback: GeneratedQuestion[]) {
  const mapped = (input || [])
    .map((raw) => {
      const q = raw as GeneratedQuestion & { question?: string; title?: string };
      return {
        type: (q.type === "multi" || q.type === "judge" ? q.type : "single") as GeneratedQuestion["type"],
        stem: String(q.stem || q.question || q.title || "").trim(),
        options: Array.isArray(q.options) && q.options.length ? q.options.map(String) : ["正确", "错误"],
        answer: Array.isArray(q.answer) && q.answer.length ? q.answer : [0],
        explanation: String(q.explanation || ""),
      };
    })
    .filter((q) => q.stem);
  return mapped.length >= 4 ? mapped.slice(0, 5) : fallback;
}

function guessTitle(filename: string, text: string) {
  const fromFile = filename.replace(/\.(md|txt|markdown|pdf|docx)$/i, "");
  const firstLine = text.split(/\r?\n/).map((l) => l.replace(/^#+\s*/, "").trim()).find(Boolean);
  return firstLine && firstLine.length < 40 ? firstLine : fromFile || "未命名课程";
}

async function chatJson<T>(
  client: InstanceType<typeof import("openai").default>,
  model: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  temperature: number,
): Promise<T> {
  const request = {
    model,
    temperature,
    // 一关的笔记 + 案例 + 5 题很容易超过默认输出上限，显式给足预算，避免 JSON 被截断
    max_tokens: 12000,
    messages,
  };
  let content = "";
  try {
    const completion = await client.chat.completions.create({
      ...request,
      response_format: { type: "json_object" },
    });
    content = completion.choices[0]?.message?.content || "{}";
  } catch {
    const completion = await client.chat.completions.create(request);
    content = completion.choices[0]?.message?.content || "{}";
  }
  return parseModelJson<T>(content);
}

export function parseModelJson<T>(text: string): T {
  const stripped = stripFence(text);
  // 依次尝试：原样 → 转义控制字符 → 还原被双写的转义引号 → 两者叠加 → 补转义字符串内的裸引号
  const variants = [
    stripped,
    escapeControlCharsInStrings(stripped),
    normalizeDoubleEscapedQuotes(stripped),
    escapeControlCharsInStrings(normalizeDoubleEscapedQuotes(stripped)),
    repairUnescapedQuotes(stripped),
    repairUnescapedQuotes(normalizeDoubleEscapedQuotes(stripped)),
  ];
  for (const variant of variants) {
    const parsed = tryParseJson<T>(variant);
    if (parsed !== undefined) return parsed;
  }
  // 兜底：模型偶发写出未转义的裸引号（如「\"信""单\"」）导致字符串提前闭合，
  // 用 jsonrepair 做容错修复后再解析
  for (const variant of [stripped, escapeControlCharsInStrings(stripped)]) {
    try {
      const parsed = tryParseJson<T>(jsonrepair(variant));
      if (parsed !== undefined) return parsed;
    } catch {
      /* 换下一种 */
    }
  }
  throw new Error("模型返回内容无法解析");
}

/** 模型偶发把引号写成 \\"（字面反斜杠 + 结束引号），会让字符串提前闭合；还原成 \" 再试 */
function normalizeDoubleEscapedQuotes(text: string): string {
  return text.replace(/\\\\"/g, '\\"');
}

/**
 * 模型在长文本里常把中文词用英文引号包起来却忘了转义（如 「\"信""单\"」），
 * 裸引号会让字符串提前闭合。这里扫描一遍：字符串内某个引号后面（跳过空白）
 * 不是 : , } ] 或结尾，就判定它是「内容里的引号」，补上转义。
 * 同时把字符串内的裸控制字符转义掉。
 */
function repairUnescapedQuotes(text: string): string {
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!inString) {
      if (c === '"') inString = true;
      out += c;
      continue;
    }
    if (escape) {
      out += c;
      escape = false;
      continue;
    }
    if (c === "\\") {
      out += c;
      escape = true;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      const next = text[j];
      if (next === ":" || next === "," || next === "}" || next === "]" || next === undefined) {
        inString = false;
        out += c;
      } else {
        out += '\\"';
      }
      continue;
    }
    if (c.charCodeAt(0) < 0x20) {
      out += JSON.stringify(c).slice(1, -1);
      continue;
    }
    out += c;
  }
  return out;
}

/** 依次尝试：整段解析 → 取第一个平衡的 { … } → 截断补全 */
function tryParseJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    /* next */
  }
  const start = text.indexOf("{");
  if (start < 0) return undefined;
  const balanced = balancedJsonSlice(text, start);
  if (balanced) {
    try {
      return JSON.parse(balanced) as T;
    } catch {
      /* next */
    }
  }
  const salvaged = salvageTruncatedJson(text.slice(start));
  return salvaged === null ? undefined : (salvaged as T);
}

/** 从 start 处的 { 开始，返回第一个括号平衡的片段（字符串内的括号不计数） */
function balancedJsonSlice(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 宽松修复 JSON 字符串内部的两类常见问题（模型写长笔记时高发）：
 *  1. 裸控制字符（换行、换页 \f、\u0001 等）——PDF 文本里很常见
 *  2. 非法转义序列（如 \x、\[）——把反斜杠变成字面字符
 */
function escapeControlCharsInStrings(text: string): string {
  let out = "";
  let inString = false;
  let escape = false;
  for (const c of text) {
    if (inString) {
      if (escape) {
        out += '"\\/bfnrtu'.includes(c) ? c : `\\${c}`;
        escape = false;
      } else if (c === "\\") {
        out += c;
        escape = true;
      } else if (c === '"') {
        inString = false;
        out += c;
      } else if (c.charCodeAt(0) < 0x20) {
        out += JSON.stringify(c).slice(1, -1);
      } else {
        out += c;
      }
      continue;
    }
    if (c === '"') inString = true;
    out += c;
  }
  return out;
}

/** 扫描 JSON 文本：括号栈、是否处于字符串中、末尾是否为未完成的转义 */
function scanJson(text: string): { stack: string[]; inString: boolean; trailingEscape: boolean } {
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (const c of text) {
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
  }
  return { stack, inString, trailingEscape: escape };
}

/**
 * 截断修复：模型输出被 max_tokens 截断时，从尾部逐段回退到最近的逗号，
 * 补全被截断的字符串与未闭合的括号，尽量救回已生成的内容。
 */
function salvageTruncatedJson(body: string): unknown | null {
  let cut = body.length;
  for (let attempt = 0; attempt < 60 && cut > 0; attempt++) {
    let slice = body.slice(0, cut);
    const { stack, inString, trailingEscape } = scanJson(slice);
    if (trailingEscape) slice = slice.slice(0, -1);
    const closers = (inString ? '"' : "") + [...stack].reverse().join("");
    const candidate = (inString ? slice : slice.replace(/[,\s]+$/, "")) + closers;
    try {
      return JSON.parse(candidate);
    } catch {
      /* 继续往前退 */
    }
    const prev = body.lastIndexOf(",", cut - 1);
    if (prev <= 0) break;
    cut = prev;
  }
  return null;
}

function stripFence(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  // 只剥掉「整段最外层」的围栏。不能用 /```([\s\S]*?)```/ 非贪婪匹配——
  // notesMd 里的 ASCII 图示本身就有 ``` 代码块，会把 JSON 截断在第一个内部围栏处。
  const nl = trimmed.indexOf("\n");
  const body = nl < 0 ? "" : trimmed.slice(nl + 1);
  const trimmedBody = body.trimEnd();
  if (trimmedBody.endsWith("```")) return trimmedBody.slice(0, -3).trimEnd();
  return body.trimEnd();
}
