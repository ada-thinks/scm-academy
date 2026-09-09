import type { GeneratedCase, GeneratedChapter, GeneratedQuestion, MindNode } from "./types";

export const GOLD_STYLE = `金标准写法（必须对齐，不要做成提纲或原文摘抄）：
1. notesMd 只讲概念、主路径、字段和判断，禁止写真实案例、故事场景、岗位互撕。案例只允许出现在 cases 字段。
2. notesMd 结构固定：
   - 开头「## 这一关你要带走什么」：2～4 句人话讲清这一关解决什么问题
   - 中间 2～3 个小节：概念/主路径/字段/角色，至少一张 Markdown 表
   - 结尾「### 记住一句」+ 引用块，一句能带走的判断
   - 不要出现「案例」「场景」「某公司」「假如你是」这类小节
3. cases 才写真实冲突：岗位互撕或操作踩坑，分析要给出下一步动作。
4. 题目考判断力。干扰项必须是「同事会真的选错」的业务误解，禁止荒诞选项。
5. 5 题配比：2 道 single、1 道 multi、2 道 judge。judge 的 options 只能是 ["正确","错误"]。
6. 手册类材料按状态机拆：主路径、主键字段、谁能审核、异常/回退；不要背菜单。`;

export function isManual(text: string) {
  return /手册|操作|菜单|字段|审核|反审核|状态|必填|权限|按钮|ASN|SKU|MOQ/.test(text);
}

/** 按教材的一级标题（第X章 / # 一级标题）切块：有几个一级标题就生成几个关卡 */
export function splitByTopChapters(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const heads: number[] = [];
  for (const [i, line] of lines.entries()) {
    const t = line.trim();
    // “第一章 行业背景”“# 一、背景”这类一级标题行
    if (/^#{1}\s*\S/u.test(t) || /^第[一二三四五六七八九十百\d]+章[\s：:]*\S/u.test(t)) heads.push(i);
  }
  // 找不到清晰一级标题时退化为通用切分
  if (heads.length < 2) return splitSections(text);

  const parts: { title: string; body: string }[] = [];
  for (let k = 0; k < heads.length; k++) {
    const end = k + 1 < heads.length ? heads[k + 1] : lines.length;
    const block = lines.slice(heads[k], end).join("\n").trim();
    if (!block) continue;
    const first = lines[heads[k]].trim();
    let title = first
      .replace(/^#{1,3}\s*/u, "")
      .replace(/^第[一二三四五六七八九十百\d]+章\s*/u, "")
      // 去掉“（优先级P1）”“（13页）”这类注释尾巴
      .replace(/[（(【\[]…?[^）)】\]]{0,20}[）)】\]]\s*$/u, "")
      .trim();
    if (!title) title = `第 ${k + 1} 章`;
    const body = lines.slice(heads[k], end).join("\n").replace(/^#{1,3}\s*/u, "").trim();
    if (body.length >= 40 || parts.length === 0) parts.push({ title, body });
  }
  return parts;
}

export function splitSections(text: string) {
  const normalized = text.replace(/\r\n/g, "\n");
  const heading = normalized.split(/(?=^#{1,3}\s+.+$|^第[一二三四五六七八九十0-9]+[章节关].+$|^[0-9]+[\.、]\s*\S+)/m);
  const parts = heading.map((block) => {
    const lines = block.trim().split("\n");
    const title = lines[0]?.replace(/^#+\s*/, "").replace(/^[0-9]+[\.、]\s*/, "").trim() || "章节";
    const body = lines.slice(1).join("\n");
    return { title, body };
  }).filter((part) => part.title && part.body.trim().length > 40);

  if (parts.length >= 2) return parts.slice(0, 8);

  const chunks = normalized.split(/\n{2,}/).filter((p) => p.trim().length > 80);
  if (!chunks.length) return [{ title: "总览", body: normalized.slice(0, 5000) }];
  return chunks.slice(0, 6).map((body, i) => ({
    title: firstSentence(body).slice(0, 18) || `要点 ${i + 1}`,
    body,
  }));
}

export function windowForChapter(text: string, title: string, keywords: string[] = []) {
  const hay = text.replace(/\r\n/g, "\n");
  const sections = splitSections(hay);
  const short = title.replace(/^第\s*\d+\s*关[·•\s-]*/, "").trim();
  const hit = sections.find((s) => s.title.includes(short) || short.includes(s.title.slice(0, 8)));
  if (hit) return `${hit.title}\n${hit.body}`.slice(0, 5000);

  const keys = [...keywords, ...short.split(/[\s·，,、]/)].filter((k) => k.length >= 2);
  let best = { score: -1, start: 0 };
  const win = 3200;
  for (let i = 0; i < hay.length; i += 700) {
    const slice = hay.slice(i, i + win);
    const score = keys.reduce((sum, key) => sum + (slice.split(key).length - 1), 0);
    if (score > best.score) best = { score, start: i };
  }
  return hay.slice(best.start, best.start + 4500);
}

export function teachChapter(index: number, title: string, body: string, filename: string): GeneratedChapter {
  const cleanTitle = title.replace(/^第\s*\d+\s*关[·•\s-]*/, "").trim() || title;
  const level = `第 ${index + 1} 关 · ${cleanTitle}`;
  const manual = isManual(`${title}\n${body}\n${filename}`);
  const points = keyPoints(body);
  const steps = extractSteps(body);
  const exceptions = extractExceptions(body);
  const fields = extractFields(body);
  const quote = pickQuote(body, manual);
  const summary = teachSummary(cleanTitle, body, manual);

  return {
    title: level,
    summary,
    notesMd: writeNotes(cleanTitle, body, { manual, points, steps, exceptions, fields, quote }),
    mindmap: buildMindmap(cleanTitle, points, steps, exceptions, fields, index),
    cases: writeCases(cleanTitle, { manual, steps, exceptions, fields, points }),
    questions: writeQuestions(cleanTitle, { manual, points, steps, exceptions, fields, quote, body }),
  };
}

function writeNotes(
  title: string,
  body: string,
  ctx: {
    manual: boolean;
    points: string[];
    steps: string[];
    exceptions: string[];
    fields: string[];
    quote: string;
  },
) {
  const lede = teachLede(title, body, ctx.manual);
  const pointLines = ctx.points.slice(0, 6).map((p) => {
    const [head, ...rest] = p.split(/[:：]/);
    if (rest.length) return `- **${head.trim()}**：${rest.join("：").trim()}`;
    return `- **${compact(p, 12)}**：${p}`;
  });

  const table = ctx.manual
    ? markdownTable(
        ["环节", "你要盯住什么"],
        [
          ["主路径", ctx.steps.slice(0, 4).join(" → ") || "按教材顺序走完，不要跳步"],
          ["主键/必填", ctx.fields.slice(0, 5).join("、") || "编码、数量、仓库、状态"],
          ["异常", ctx.exceptions[0] || "失败时先对状态和权限，不要连点"],
        ],
      )
    : markdownTable(
        ["角色/对象", "这一关要问的问题"],
        [
          [title, "它解决什么不确定性？"],
          ["库存/数量", "账面、可用、预留是否被当成一回事？"],
          ["协同对象", "谁承诺、谁执行、信息有没有闭环？"],
        ],
      );

  const midTitle = ctx.manual ? "主路径怎么走" : "先把概念立住";
  const exceptionBlock = ctx.exceptions.length
    ? ctx.exceptions.slice(0, 4).map((e) => `- ${e}`).join("\n")
    : `- 成功路径会了还不够，先列出 3 个失败场景再上机。`;

  return `## 这一关你要带走什么

${lede}

### ${midTitle}

${pointLines.join("\n") || `- **主线**：把「${title}」还原成可执行的步骤，而不是背句子。`}

${ctx.steps.length ? `\n操作顺序：${ctx.steps.slice(0, 6).join(" → ")}。\n` : ""}

### ${ctx.manual ? "字段与约束" : "关键对照"}

${table}

### ${ctx.manual ? "异常与禁区" : "最容易想错的地方"}

${exceptionBlock}

### 记住一句

> ${ctx.quote}
`;
}

function writeCases(
  title: string,
  ctx: { manual: boolean; steps: string[]; exceptions: string[]; fields: string[]; points: string[] },
): GeneratedCase[] {
  const field = ctx.fields[0] || "主键字段";
  const step = ctx.steps[0] || "主路径第一步";
  const ex = ctx.exceptions[0] || "系统提示失败";
  if (ctx.manual) {
    return [
      {
        title: `反审核/改单把「${title}」搞乱了`,
        scene: `已经走到「${step}」，销售或仓管把单据改了数量。现场还按旧任务作业，出现超发或缺货。有人建议先改系统数字，把报表做平。`,
        analysis: `状态回退是高风险操作。先作废未完成任务、释放预留，再改单。盯住 ${field} 和库存状态（账面/可用/预留），不要私下改账。`,
      },
      {
        title: `卡在「${compact(ex, 16)}」`,
        scene: `新人连续点击同一个按钮。同事说「手册没写就绕过去」。库存和单据对不上。`,
        analysis: `停手。核对状态、权限和 ${ctx.fields.slice(0, 3).join("、") || "主键"}。${ex} 往往是约束，不是建议。找不到原因就升级，而不是绕过闭环。`,
      },
    ];
  }
  return [
    {
      title: `总量看起来很好，${title} 却在打架`,
      scene: `报表数字不差，但一线互相甩锅：有人缺货、有人积压。会议只在争论「是计划不行还是执行不行」。`,
      analysis: `先把问题拆到 SKU/单据/状态，不要看总量。问 ${title} 在对冲什么不确定性，再决定加库存、改交期还是改协同。`,
    },
    {
      title: `口头承诺把风险甩给履约`,
      scene: `为了拿单或赶进度，有人把交期/数量口头加码。下游只好加安全库存或加班，事后没人认账。`,
      analysis: `承诺必须回到可用量或产能。${ctx.points[0] || title} 如果不能被系统状态表达，就还没学会这一关。`,
    },
  ];
}

function writeQuestions(
  title: string,
  ctx: {
    manual: boolean;
    points: string[];
    steps: string[];
    exceptions: string[];
    fields: string[];
    quote: string;
    body: string;
  },
): GeneratedQuestion[] {
  const main = ctx.points[0] || `${title}的主线`;
  const wrongs = ctx.manual
    ? ["把每个按钮名称背下来就行", "失败时连续点击直到过", "先改系统数字把报表做平"]
    : ["只看仓库总金额就够了", "销售可以口头加码交期", "库存越高说明供应链越健康"];
  const field = ctx.fields.slice(0, 3);
  const multiRight = ctx.manual
    ? ["状态变化", "主键/必填字段", "异常与回退"]
    : ["主流程", "关键约束", "异常路径"];
  return [
    {
      type: "single",
      stem: `学完「${title}」，更准确的理解是？`,
      options: [
        compact(main, 42),
        wrongs[0],
        wrongs[1],
        wrongs[2],
      ],
      answer: [0],
      explanation: "这一关要带走的是判断框架，不是表面操作。",
    },
    {
      type: "judge",
      stem: ctx.manual
        ? `「${title}」只要会走成功路径即可，异常和回退可以以后再看。`
        : `把「${title}」学成名词解释，就算掌握了。`,
      options: ["正确", "错误"],
      answer: [1],
      explanation: "现场高频问题几乎都在异常、状态和协同上。",
    },
    {
      type: "multi",
      stem: ctx.manual ? "操作系统或手册时，应同时抓住哪些？（多选）" : `掌握「${title}」需要同时看到哪些？（多选）`,
      options: [...multiRight, "界面配色和好不好看"],
      answer: [0, 1, 2],
      explanation: "配色不重要。主线、约束、异常才构成可执行知识。",
    },
    {
      type: "single",
      stem: ctx.manual ? "分配/过账/审核失败时，优先检查什么？" : "看到库存或进度异常，更应该先问什么？",
      options: ctx.manual
        ? [
            "可用量、预留、权限和单据状态",
            "再点三次同一按钮",
            "直接改数据库",
            field[0] ? `把 ${field[0]} 从手册里删掉` : "忽略报错继续发货",
          ]
        : [
            "它在对冲什么不确定性、哪一段协同断了",
            "能不能再便宜一点",
            "仓库面积够不够大",
            "要不要先把总库存做高",
          ],
      answer: [0],
      explanation: "先定位状态和不确定性，再动手。",
    },
    {
      type: "judge",
      stem: ctx.quote.includes("不要") || ctx.quote.includes("禁止")
        ? `结合教材：${compact(ctx.quote, 48)}`
        : ctx.manual
          ? `已进入履约的单据可以直接反审核改数量，不必释放预留。`
          : `只要总量对得上，「${title}」就一定健康。`,
      options: ["正确", "错误"],
      answer: [1],
      explanation: ctx.quote,
    },
  ];
}

function buildMindmap(
  title: string,
  points: string[],
  steps: string[],
  exceptions: string[],
  fields: string[],
  index: number,
): MindNode {
  const kids = (items: string[], prefix: string) =>
    items.slice(0, 4).map((label, i) => ({ id: `${prefix}-${index}-${i}`, label: compact(label, 14) }));
  return {
    id: `c${index}`,
    label: compact(title, 12),
    children: [
      { id: `p${index}`, label: "要点", children: kids(points, "pt") },
      steps.length ? { id: `s${index}`, label: "主路径", children: kids(steps, "st") } : undefined,
      fields.length ? { id: `f${index}`, label: "字段", children: kids(fields, "fd") } : undefined,
      exceptions.length ? { id: `e${index}`, label: "异常", children: kids(exceptions, "ex") } : undefined,
    ].filter(Boolean) as MindNode[],
  };
}

function teachLede(title: string, body: string, manual: boolean) {
  const s = sentences(body).filter((x) => x.length > 12 && x.length < 80).slice(0, 2);
  if (manual) {
    return `「${title}」不是记菜单，而是一条能走完、能回退的作业链。${s[0] || "先还原主路径。"} 你要能讲清：谁在什么状态下做什么，失败时看哪个字段。`;
  }
  return `「${title}」要先变成判断，再变成流程。${s[0] || ""} 学完这一关，你应能向同事解释它解决什么问题、最容易在哪一步想错。`;
}

function teachSummary(title: string, body: string, manual: boolean) {
  if (manual) return `把「${title}」还原成主路径、主键和异常，而不是背按钮。`;
  const s = sentences(body).find((x) => x.length > 10 && x.length < 36);
  return s || `先搞懂「${title}」在供应链里解决什么问题。`;
}

function keyPoints(body: string) {
  const bullets = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*•、]/.test(l) || /^\d+[\.、]/.test(l))
    .map((l) => l.replace(/^[-*•、\d\.]+/, "").trim())
    .filter((l) => l.length >= 6 && l.length <= 60);
  if (bullets.length >= 3) return unique(bullets).slice(0, 8);
  return unique(
    sentences(body)
      .filter((s) => s.length >= 8 && s.length <= 48)
      .slice(0, 8),
  );
}

function extractSteps(body: string) {
  const arrow = body.match(/[^。\n]{2,12}(?:→|->|＞|》|再)[^。\n]{2,20}/g) || [];
  const numbered = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d+[\.、]/.test(l) || /^(然后|接着|随后|最后)/.test(l))
    .map((l) => l.replace(/^\d+[\.、]\s*/, "").replace(/^(然后|接着|随后|最后)/, "").trim());
  const chained = body.match(/[\u4e00-\u9fa5]{2,8}(?:→|→\s*)[\u4e00-\u9fa5]{2,8}/g) || [];
  return unique([...splitArrows(arrow), ...numbered, ...chained]).slice(0, 8);
}

function splitArrows(items: string[]) {
  return items.flatMap((item) => item.split(/\s*(?:→|->|＞)\s*/).map((s) => s.trim()).filter((s) => s.length >= 2 && s.length <= 16));
}

function extractExceptions(body: string) {
  return unique(
    sentences(body)
      .filter((s) => /异常|失败|禁止|不要|不能|不可|禁止|报错|缺货|对不上|回退|反审核/.test(s))
      .map((s) => compact(s, 42)),
  ).slice(0, 6);
}

function extractFields(body: string) {
  const named = body.match(/[\u4e00-\u9fa5A-Za-z]{2,12}(?:编码|号|字段|状态|数量|仓库|权限|交期|订单)/g) || [];
  const listed = body.match(/(?:必填|主键|字段)[:：]?\s*([^。\n]+)/g) || [];
  const fromList = listed.flatMap((l) => l.replace(/.*[:：]/, "").split(/[、，,；;]/)).map((s) => s.trim());
  return unique([...named, ...fromList].map((s) => compact(s, 16)).filter((s) => s.length >= 2)).slice(0, 8);
}

function pickQuote(body: string, manual: boolean) {
  const hit = sentences(body).find((s) => /必须|不要|先|禁止|应该/.test(s) && s.length < 46);
  if (hit) return hit;
  return manual
    ? "手册服务于流程。先找状态、主键和异常，再碰按钮。"
    : "看到库存或延误，先问它在对冲什么不确定性。";
}

function sentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/[。！？!?\n]/)
    .map((s) => s.replace(/^#+\s*/, "").trim())
    .filter(Boolean);
}

function firstSentence(text: string) {
  return sentences(text)[0] || text.trim().slice(0, 18);
}

function compact(text: string, max: number) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function unique(items: string[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.replace(/\s+/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function markdownTable(headers: string[], rows: string[][]) {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

/** 精讲只留概念，把案例小节留给 CASE 卡片。 */
export function stripCasesFromNotes(md: string) {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.+)/.exec(line);
    if (heading) {
      skipping = /案例|场景故事|真实场景|业务场景|现场怎么用|假如你是|某公司|某品牌|CASE/i.test(heading[2]);
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
