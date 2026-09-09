import type { GeneratedCourse, GeneratedChapter, GeneratedQuestion } from "./types";
import { prisma } from "./prisma";
import {
  GOLD_STYLE,
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
type LocalSection = { title: string; body: string };

function localOutline(rawText: string, filename: string) {
  let sections: LocalSection[] = splitByTopChapters(rawText);
  if (!sections.length) {
    sections = [{ title: guessTitle(filename, rawText), body: rawText.slice(0, 5000) }];
  }
  return {
    title: guessTitle(filename, rawText),
    description: `按一级标题拆成 ${sections.length} 个关卡（几个一级标题几个关）。每关先精讲本小章节，再看脑图与案例，最后做测验通关。`,
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
    const slice = section.body.slice(0, 7000);
    try {
      onProgress?.({ stage: "writing", done: index, total: outline.sections.length });
      const chapter = await chatJson<GeneratedChapter>(client, settings.model, [
        {
          role: "system",
          content: `${GOLD_STYLE}\n现在只写这一关（教材中的一个一级章节）。精讲不要写案例故事。案例只放在 cases。只输出 JSON。每题必须有 stem。`,
        },
        {
          role: "user",
          content: `这是学习宝典第 ${index + 1} 关，建议标题：第 ${index + 1} 关 · ${section.title}\n\n请输出：{"title","summary","notesMd","mindmap":{"id","label","children":[{"id","label","children":[]}]},"cases":[{"title","scene","analysis"},{"title","scene","analysis"}],"questions":[{"type":"single","stem":"题干","options":["A","B","C","D"],"answer":[0],"explanation":"..."}]}\nnotesMd 沿用教材小章节（1.1 / 2.2 或 ## 小标题）来组织，只讲概念/主路径/字段/记住一句，禁止写真实案例。\nmindmap 一级 children 对应本章各小章节名称，每个小章节下挂 2~4 个要点分支。\ncases 写 2 个冲突场景。\nquestions 必须 5 道，每题都有 stem。配比 2 single、1 multi、2 judge。\n\n本关教材原文：\n${slice}`,
        },
      ], 0.45);
      chapters.push(polishChapter(chapter, index, slice, filename));
    } catch (error) {
      console.error(error);
      chapters.push(teachChapter(index, section.title, slice, filename));
    }
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
    teachChapter(index, section.title, section.body, filename),
  );
  return {
    title: outline.title,
    description: outline.description,
    coverEmoji: outline.coverEmoji,
    chapters,
  };
}

function polishChapter(input: GeneratedChapter, index: number, source: string, filename: string): GeneratedChapter {
  const fallback = teachChapter(index, input.title || `第 ${index + 1} 关`, source, filename);
  const notes = (input.notesMd || "").trim();
  const questions = normalizeQuestions(input.questions, fallback.questions);
  return {
    title: input.title?.includes("关") ? input.title : fallback.title,
    summary: input.summary || fallback.summary,
    notesMd: stripCasesFromNotes(
      notes.length >= 280 && notes.includes("这一关") ? notes : fallback.notesMd,
    ),
    mindmap: input.mindmap?.label ? input.mindmap : fallback.mindmap,
    cases: (input.cases || []).length >= 2 ? input.cases.slice(0, 2) : fallback.cases,
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

function parseModelJson<T>(text: string): T {
  const stripped = stripFence(text);
  // 先尝试整段解析
  try {
    return JSON.parse(stripped) as T;
  } catch {
    /* next */
  }
  // 模型经常在最外层 JSON 前后加说明文字，取第一个平衡的 { ... } 再试
  const start = stripped.indexOf("{");
  if (start < 0) throw new Error("模型返回内容无法解析");
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < stripped.length; i++) {
    const c = stripped[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
    } else {
      if (c === '"') {
        inString = true;
      } else if (c === "{") {
        depth++;
      } else if (c === "}") {
        depth--;
        if (depth === 0) {
          const candidate = stripped.slice(start, i + 1);
          try {
            return JSON.parse(candidate) as T;
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new Error("模型返回内容无法解析");
}

function stripFence(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : trimmed;
}
