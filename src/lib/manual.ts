/**
 * 操作手册解析器（本地启发式）
 *
 * 目标：把“操作手册”解析成结构化的 ManualFlow / ManualStep。
 * 支持的排版（线上保理手册实测 + 常见变体）：
 *   - 流程标题：`流程 1｜企业建档（内管端 + 客户端联动）`
 *   - 步骤标题：`Step 1｜发起建档（内管端）` / `Step 3-6｜分步填写（共 4 步）`
 *   - 前置/说明：出现在步骤前的引导行，作为该流程的 goal
 *   - 编号明细：跟在 Step 后面的 `1. xxx` `2. xxx`，归属当前 Step
 *   - 换行折行：自动把折行合并回上一个编号项
 *   - 附录表格：`xx相关数据库表（持续补充中）` 之后的内容丢弃（不是操作步骤）
 */

export type ParsedFlowStep = {
  kind: string; // step | end
  actor: string;
  title: string;
  detail: string; // 换行分隔的操作明细
};

export type ParsedManualFlow = {
  title: string;
  goal: string;
  /** 该流程原文（去掉附录表格后的干净文本） */
  md: string;
  steps: ParsedFlowStep[];
};

/** PDF 提取常把常用字替换成康熙部首/部首补充区的兼容字，先统一映射回常用字 */
const COMPAT_CHAR: Record<string, string> = {
  "\u2f3e": "户", // ⼾
  "\u2f3f": "手", // ⼿
  "\u2f3c": "心", // ⼼
  "\u2f0a": "入", // ⼊
  "\u2f26": "子", // ⼦
  "\u2f45": "方", // ⽅
  "\u2f64": "用", // ⽤
  "\u2ec5": "见", // ⻅
  "\u2eda": "页", // ⻚
  "\u2faf": "面", // ⾯
  "\u2f20": "士", // ⼠
  "\u2f2f": "工", // ⼯
  "\u2f00": "一", // ⼀
  "\u2f70": "示", // ⽰
  "\u2ec6": "角", // ⻆
  "\u2f8a": "色", // ⾊
  "\u2fb8": "首", // ⾸
  "\u2f08": "人", // ⼈
  "\u2f83": "自", // ⾃
  "\u2f46": "无", // ⽆
  "\u2f74": "立", // ⽴
  "\u2f40": "支", // ⽀
  "\u2f9b": "走", // ⾛
  "\u2f8f": "行", // ⾏
  "\u2f63": "生", // ⽣
  "\u2f1d": "口", // ⼝
  "\u2f6c": "目", // ⽬
  "\u2f50": "比", // ⽐
  "\u2f47": "日", // ⽇
  "\u2f4c": "止", // ⽌
  "\u2f42": "文", // ⽂
  "\u2edb": "风", // ⻛
  "\u2fa6": "金", // ⾦
};

export function normalizeCompatChars(text: string) {
  return [...text]
    .map((ch) => COMPAT_CHAR[ch] ?? ch)
    .join("");
}

/** 角色关键词（用于从步骤标题的（…）里认出操作端） */
const ACTOR_WORDS = ["内管端", "客户端", "资金方", "融资方", "核心企业", "经销商", "供应商", "管理员", "系统", "客户"];

function pickActor(inner: string): string {
  let start = -1;
  let matched = "";
  for (const word of ACTOR_WORDS) {
    const index = inner.indexOf(word);
    if (index >= 0 && (start === -1 || index < start)) {
      start = index;
      matched = word;
    }
  }
  if (start === -1) return "";
  // 从命中角色截取，只保留“客户端·核心企业”这类连缀，丢到“，共 N 步 / + …”等尾巴
  const head = inner.slice(start).trim().replace(/^[\s，,、+·:：]+/, "");
  const cut = head.search(/[，,、+]/);
  return (cut > 0 ? head.slice(0, cut) : head).trim().slice(0, 16) || matched;
}

/** 从正文开头推断操作端（步骤标题没写括注时兜底） */
function inferActorFromText(detail: string): string {
  const head = detail.trim();
  let best = "";
  let bestIndex = Number.MAX_SAFE_INTEGER;
  for (const word of ACTOR_WORDS) {
    const index = head.indexOf(word);
    if (index >= 0 && index < bestIndex) {
      bestIndex = index;
      best = word;
    }
  }
  // 只认开头的角色，避免正文中间提到的词误判
  return bestIndex <= 6 ? best : "";
}

/** 去掉标题末尾的角色括注，如（内管端）（客户端·核心企业） */
function cleanTitle(text: string): { title: string; actor: string } {
  const trailing = /([（(])([^（）()]+)([）)])\s*$/.exec(text);
  if (!trailing) return { title: text.trim(), actor: "" };
  const inner = trailing[2].trim();
  const actor = pickActor(inner);
  // 括注属于角色说明（内管端 / 客户端 · 核心企业…），从标题里摘掉
  const title = text.slice(0, trailing.index).replace(/[\s｜|]+$/, "").trim();
  return { title: title || inner, actor };
}

/** 判断一行是否进入附录（数据库表 / 补充说明表格） */
function isAppendixStart(line: string) {
  return /数据库表|表名\s+说明|补充资料表|资料表/.test(line);
}

/** 把「流程 N｜标题」段整体拆出来 */
function splitFlows(lines: string[]): { header: string; rest: string[] }[] {
  const flows: { header: string; rest: string[] }[] = [];
  let current: { header: string; rest: string[] } | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // 流程标题：流程 1｜… / 流程1: … / # 流程 1｜…
    const m = /^(?:#{1,6}\s*)?流程\s*([0-9一二三四五六七八九十]{1,3})?\s*[｜|:：]\s*(.+)$/.exec(line);
    if (m) {
      if (current) flows.push(current);
      current = { header: line.replace(/^#{1,6}\s*/, ""), rest: [] };
      continue;
    }
    if (current) current.rest.push(line);
  }
  if (current) flows.push(current);
  return flows;
}

export function parseManualFlows(rawText: string): ParsedManualFlow[] {
  const text = normalizeCompatChars(rawText);
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim());
  const flows = splitFlows(lines);
  if (!flows.length) {
    // 没有「流程 N」结构的文档，给一个兜底流程，避免页面空白
    return [
      {
        title: "总览",
        goal: "",
        md: text.trim(),
        steps: [{ kind: "end", actor: "", title: "阅读手册", detail: text.trim().slice(0, 6000) }],
      },
    ];
  }

  return flows.map((flow) => {
    // —— 流程内按 Step/编号切出节点 ——
    const steps: ParsedFlowStep[] = [];
    let currentStep: { actor: string; title: string; detail: string[]; items: string[] } | null = null;
    const introLines: string[] = [];
    let inAppendix = false;

    const commitStep = () => {
      if (!currentStep) return;
      const detail = currentStep.detail
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
      if (detail || currentStep.items.length === 0) {
        steps.push({
          kind: "step",
          actor: currentStep.actor,
          title: currentStep.title,
          detail,
        });
      }
      currentStep = null;
    };

    for (const line of flow.rest) {
      if (inAppendix) continue;
      if (isAppendixStart(line)) {
        inAppendix = true;
        continue;
      }
      // Step 标题：Step 1｜… / Step 3-6｜分步填写
      const stepM = /^Step\s*([\d\-~～、，]+)?\s*[｜|:：]?\s*(.+)$/i.exec(line);
      if (stepM && stepM[2]) {
        commitStep();
        const clean = cleanTitle(stepM[2].trim());
        currentStep = { actor: clean.actor, title: clean.title, detail: [], items: [] };
        continue;
      }
      // 步骤编号：1. xxx / 1、xxx / （1）xxx
      const itemM = /^(\d{1,3})[.、）)]\s*(.+)$/.exec(line);
      if (itemM && itemM[2]) {
        if (!currentStep) {
          // 编号出现在第一个 Step 前：若流程以“前置/后置：…”起头，就把它当作首个步骤节点
          const pending = introLines.filter((l) => /^(前置|后置|Step)\s*[:：]?/.test(l));
          if (pending.length) {
            const clean = cleanTitle(pending[pending.length - 1].replace(/^(前置|后置|Step)\s*[:：]?\s*/, ""));
            currentStep = { actor: clean.actor, title: clean.title, detail: [], items: [] };
            introLines.length = 0;
          } else {
            currentStep = { actor: "", title: "开始操作", detail: [], items: [] };
          }
        }
        currentStep.items.push(itemM[2].trim());
        currentStep.detail.push(itemM[2].trim());
        continue;
      }
      // 其它行：Step 标题前的说明 / 上一编号项的折行
      if (!currentStep || !currentStep.detail.length) {
        if (!stepM) introLines.push(line);
        continue;
      }
      // 折行补回上一行（保留子要点符号 - ）
      const lastIndex = currentStep.detail.length - 1;
      currentStep.detail[lastIndex] = `${currentStep.detail[lastIndex]}${line}`;
    }
    commitStep();

    if (!steps.length && !introLines.length) {
      steps.push({ kind: "end", actor: "", title: flow.header, detail: "" });
    }

    const goal = buildGoal(introLines);
    const md = flow.rest.filter((l) => !isAppendixStart(l)).join("\n").trim();

    const output: ParsedManualFlow = {
      title: flow.header,
      goal,
      md,
      steps,
    };
    // 步骤标题没写操作端时，从正文开头推断（如“客户端登录：…”）
    for (const step of output.steps) {
      if (!step.actor && step.detail) step.actor = inferActorFromText(step.detail);
    }
    // 最后一个节点标成“完成态”，流程图末端显示 ✓
    if (output.steps.length) {
      const last = output.steps[output.steps.length - 1];
      output.steps[output.steps.length - 1] = { ...last, kind: "end" };
    }
    // 标题去角色括注（不影响流程名；如“流程 1｜企业建档（内管端+客户端联动）”过长时可读）
    const clean = cleanTitle(output.title);
    if (clean.actor && clean.title.length >= 2 && output.title.includes("（")) {
      output.title = clean.title;
    }
    return output;
  }).filter((flow) => flow.steps.length > 0 || flow.md);
}

/** 从流程头部说明行拼 goal（说明：… / 前置：… / 流程描述） */
function buildGoal(introLines: string[]): string {
  const joined = introLines
    .map((l) => l.replace(/^(说明|前置|概述|流程说明)\s*[:：]?\s*/, "").trim())
    .filter(Boolean)
    .join(" ");
  if (!joined) return "";
  return joined.length > 160 ? `${joined.slice(0, 160)}…` : joined;
}

/** 生成流程图用的流程内容：本流程操作目标 + 步骤明细（给 persist 用） */
export function buildFlowGoals(flows: ParsedManualFlow[]) {
  return flows.map((flow) => flow.goal || flow.steps[0]?.title || "");
}
