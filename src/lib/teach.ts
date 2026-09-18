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

/** 教材类（知识库/法规/概念教材）金标准：与大章节下的“小章节”一一对应展开 */
export const GOLD_BOOK_STYLE = `教材类金标准（讲行业背景、定义、分类、机制、法律条款这类知识教材时必须对齐）：
1. 关卡 = 教材的一个大章节；本章的内容必须按教材自身的「小章节」逐节展开，小节名称和顺序与原文一致，不要自创章节。
2. notesMd 结构：
   - 开头「## 这一关你要带走什么」：2～3 句讲清这个大章节在解决什么问题。
   - 中间每一节都用「### 小章节号+标题」（如「### 1.2.1 为什么会有保理业务」）独立成节，节内只重述该小节的概念、依据、数据与结论，忠实于教材原文。
   - 结尾「### 记住一句」+ 引用块。
   - 严禁出现「主路径/主键/字段/异常/按钮/审核/仓库/库存/发货/系统操作」这类操作手册用语；教材没讲的内容不要脑补成业务流程。
3. mindmap 一级 children = 本关各小章节（label 带小章节号，如「1.1 业务定义」）；每个小章节下挂 2～4 个该节要点。禁止用「要点/主路径/字段/异常」这类加工分类框。
4. cases 0～2 个：把本章知识放进「假设的真实交易」里检验——场景要有主角（某类供应商/买方/保理商）、大致金额或账期期限与一个决策点；analysis 说明应套用本章哪条概念来判断。没有合适的场景就写 0 个，不要硬凑，更不要写操作系统的故事。
5. 题目考「这一章的知识怎么用于业务判断」，干扰项应是业务上真会混淆的说法。5 题配比 2 single、1 multi、2 judge。`;

/** 强“操作手册”信号：只认系统操作型表述，避免把知识教材（含“单据/审核/过账/字段”等一般词）误判成手册 */
export function isManual(text: string) {
  return /点击|按钮|菜单|反审核|勾选|下拉|回车|登录系统|系统提示|系统里|界面|保存单据|打印|ASN|SKU|MOQ|入库单|出库单/u.test(text);
}

/* ------------------------------------------------------------------ */
/* PDF 文本清洗：去掉“1 / 13”页脚，并把按行折行打断的句子接回同一行       */
/* ------------------------------------------------------------------ */

const PAGE_NO = /^\d+\s*\/\s*\d+\s*$/u;
const HEAD_LINE =
  /^(?:#{1,6}\s+\S|[0-9]+(?:\.[0-9]+){1,2}[、.．]?\s*\S|第[一二三四五六七八九十百\d]+[章节关部分]\s*\S)/u;
const LIST_LINE = /^\s*(?:[-*•·]\s*|[（(]?[一二三四五六七八九十\d]+[)）、.．]\s*\S)/u;
const END_PUNCT = /[。！？；!?;：:]$/u;

export function cleanPdfText(text: string): string {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      out.push("");
      continue;
    }
    if (PAGE_NO.test(line)) continue; // “1 / 13”页脚
    if (/^(?:[-*•·●◦▪–—―－]\s*){2,}/u.test(line)) continue; // “• • •”“- • •”装饰行
    if (HEAD_LINE.test(line) || LIST_LINE.test(line)) {
      out.push(line);
      continue;
    }
    const prev = out.length ? out[out.length - 1] : "";
    const prevJoinable =
      prev &&
      !prev.endsWith("\n\n") &&
      !HEAD_LINE.test(prev.trim()) &&
      !LIST_LINE.test(prev) &&
      !END_PUNCT.test(prev.trim());
    if (prevJoinable) out[out.length - 1] = `${prev}${line}`;
    else out.push(line);
  }
  return out
    .join("\n")
    .replace(/\n{2,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 教材里的一节：label 形如「1.1 业务定义」，body 为该节正文 */
export type BookSection = { label: string; body: string };

/** 按“1.1 小节 / 1.2.1 子小节”拆一个大章节；父小节无正文只做容器时并入子小节 */
export function splitBookSections(text: string): BookSection[] {
  const cleaned = cleanPdfText(text);
  const lines = cleaned.split("\n");
  const hits: { label: string; seg: number[]; start: number }[] = [];
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    // 允许小节标题带 Markdown 前缀（如原文里的 “### 2.3 与相关产品比较”）
    const m = /^#{0,6}\s*(\d+(?:\.\d+){1,3})\s+(.{2,40})$/.exec(line);
    if (!m) continue;
    const name = m[2].replace(/[（(【\[]…?.{0,20}[）)】\]]\s*$/u, "").trim();
    if (!name || /^[0-9.、．]+$/.test(name)) continue;
    hits.push({ label: `${m[1]} ${name}`, seg: m[1].split(".").map(Number), start: i });
  }
  if (hits.length < 2) return [];

  const isChild = (a: number[], b: number[]) =>
    b.length > a.length && a.every((v, i) => v === b[i]);

  const subs: BookSection[] = [];
  for (let k = 0; k < hits.length; k++) {
    const hit = hits[k];
    const end = k + 1 < hits.length ? hits[k + 1].start : lines.length;
    const body = lines.slice(hit.start + 1, end).join("\n").trim();
    const next = hits[k + 1];
    // 父小节标题后紧跟更深一层的子小节：父只是容器，去掉避免内容重复
    if (next && isChild(hit.seg, next.seg) && body.length < 40) continue;
    subs.push({ label: hit.label, body });
  }
  return subs.length >= 2 ? subs : [];
}

/** 从标题里拆出业务优先级标注，如「第四章 业务流程详解（优先级P1）」→ { title: 去标注标题, priority: "P1" } */
export function splitPriorityTail(title: string) {
  const m = /[（(]\s*优先级\s*[Pp]?\s*(\d)\s*[）)]/.exec(title.trim());
  if (!m) return { title: title.trim(), priority: "" };
  const priority = `P${m[1]}`;
  const clean = title.trim().replace(/[（(]\s*优先级\s*[Pp]?\s*\d\s*[）)]/u, "").trim();
  return { title: clean, priority };
}

export type TeachSection = { title: string; body: string; priority?: string };

/** 按教材的一级标题（第X章 / # 一级标题）切块：有几个一级标题就生成几个关卡 */
export function splitByTopChapters(text: string): TeachSection[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const heads: number[] = [];
  for (const [i, line] of lines.entries()) {
    const t = line.trim();
    // “第一章 行业背景”“# 一、背景”这类一级标题行。
    // 注意：只认单 #（(?!#)），否则 “### 2.3 与相关产品比较” 这类小节会被误判成一级章节
    if (/^#(?!#)\s*\S/u.test(t) || /^第[一二三四五六七八九十百\d]+章[\s：:]*\S/u.test(t)) heads.push(i);
  }
  // 找不到清晰一级标题时退化为通用切分
  if (heads.length < 2) return splitSections(text);

  const parts: TeachSection[] = [];
  for (let k = 0; k < heads.length; k++) {
    const end = k + 1 < heads.length ? heads[k + 1] : lines.length;
    const block = lines.slice(heads[k], end).join("\n").trim();
    if (!block) continue;
    const first = lines[heads[k]].trim();
    // 先把优先级标注（优先级P1）提取并移除，再清其它注释尾巴（如“13页”）
    let title = first
      .replace(/^#{1,3}\s*/u, "")
      .replace(/^第[一二三四五六七八九十百\d]+章\s*/u, "");
    const { title: cleanTitle, priority } = splitPriorityTail(title);
    title = cleanTitle
      .replace(/[（(【\[]…?[^）)】\]]{0,20}[）)】\]]\s*$/u, "")
      .trim();
    if (!title) title = `第 ${k + 1} 章`;
    const body = lines.slice(heads[k], end).join("\n").replace(/^#{1,3}\s*/u, "").trim();
    if (body.length >= 40 || parts.length === 0) parts.push({ title, body, priority });
  }
  return parts;
}

export function splitSections(text: string) {
  const normalized = text.replace(/\r\n/g, "\n");
  const heading = normalized.split(/(?=^#{1,3}\s+.+$|^第[一二三四五六七八九十0-9]+[章节关].+$|^[0-9]+[\.、]\s*\S+)/m);
  const parts = heading.map((block) => {
    const lines = block.trim().split("\n");
    let title = lines[0]?.replace(/^#+\s*/, "").replace(/^[0-9]+[\.、]\s*/, "").trim() || "章节";
    const { title: cleanTitle, priority } = splitPriorityTail(title);
    title = cleanTitle;
    const body = lines.slice(1).join("\n");
    return { title, body, priority };
  }).filter((part) => part.title && part.body.trim().length > 40);

  if (parts.length >= 2) return parts.slice(0, 8);

  const chunks = normalized.split(/\n{2,}/).filter((p) => p.trim().length > 80);
  if (!chunks.length) return [{ title: "总览", body: normalized.slice(0, 5000) }];
  return chunks.slice(0, 6).map((body, i) => ({
    title: firstSentence(body).slice(0, 18) || `要点 ${i + 1}`,
    body,
    priority: "",
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

export function teachChapter(
  index: number,
  title: string,
  body: string,
  filename: string,
  priority?: string,
): GeneratedChapter {
  const cleanTitle = title.replace(/^第\s*\d+\s*关[·•\s-]*/, "").trim() || title;
  const level = `第 ${index + 1} 关 · ${cleanTitle}`;
  const cleaned = cleanPdfText(body);
  const manual = isManual(`${title}\n${cleaned}\n${filename}`);
  const subs = splitBookSections(cleaned);

  // 教材类（非手册）：整关按教材小章节展开；拆不出小节时把整章当一节
  if (!manual) {
    const bookSections: BookSection[] =
      subs.length >= 2 ? subs : [{ label: cleanTitle || "本章要点", body: cleaned }];
    const quote = bookQuote(cleaned, bookSections);
    return {
      title: level,
      priority,
      summary: teachSummary(cleanTitle, cleaned, false),
      notesMd: writeBookNotes(cleanTitle, bookSections, quote),
      mindmap: buildBookMindmap(cleanTitle, bookSections, index),
      cases: writeBookCases(cleanTitle, bookSections),
      questions: writeBookQuestions(cleanTitle, bookSections, quote),
    };
  }

  const points = keyPoints(cleaned);
  const steps = extractSteps(cleaned);
  const exceptions = extractExceptions(cleaned);
  const fields = extractFields(cleaned);
  const quote = pickQuote(cleaned, manual);
  const summary = teachSummary(cleanTitle, cleaned, manual);

  return {
    title: level,
    priority,
    summary,
    notesMd: writeNotes(cleanTitle, cleaned, { manual, points, steps, exceptions, fields, quote }),
    mindmap: buildMindmap(cleanTitle, points, steps, exceptions, fields, index),
    cases: writeCases(cleanTitle, { manual, steps, exceptions, fields, points }),
    questions: writeQuestions(cleanTitle, { manual, points, steps, exceptions, fields, quote, body: cleaned }),
  };
}

/* ------------------------------------------------------------------ */
/* 教材类（知识库/概念教材）：整关 = 大章节，内部按小章节展开            */
/* ------------------------------------------------------------------ */

function bookLede(title: string, subs: BookSection[]) {
  const first = subs[0]?.label || "";
  return `「${title}」是教材中的一个章节，下面按 ${subs.length} 个小节展开，从「${compact(first.replace(/^\d+(?:\.\d+)*\s*/, ""), 14)}」开始逐节读。学完这一关，你应能对照教材讲清每个小节要解决的问题，并把这些概念用到真实业务判断上。`;
}

/** 从小节正文抽出可展示的要点行：优先原文项目符号/编号行，其次按句抽取 */
function bookBullets(body: string): string[] {
  const lines = body.split("\n").map((l) => l.trim());
  const markerRe = /^(?:[-–—―－*•·]|[（(]?[一二三四五六七八九十\d]+[)）、.．])\s*/u;
  const isItem = (l: string) => markerRe.test(l) && !/^(?:[-–—―－*•·]\s*){2,}/u.test(l);
  const cleanItem = (l: string) => l.replace(markerRe, "").trim();
  // 剔除页脚残片与“• • •”装饰残留在条目里
  const good = (l: string) =>
    l.length >= 6 && !/[•●◦▪◎]/u.test(l) && !/\d+\s*\/\s*\d+/u.test(l);
  const fromList = lines
    .filter(isItem)
    .map(cleanItem)
    .filter(good)
    .map((l) => compact(l, 120));
  if (fromList.length >= 2) return unique(fromList).slice(0, 8);
  return unique(
    sentences(body)
      .filter((s) => s.length >= 10)
      .map((s) => compact(s, 110))
      .filter(good),
  ).slice(0, 6);
}

function writeBookNotes(title: string, subs: BookSection[], quote: string) {
  const blocks = subs.map((sub) => {
    const bullets = bookBullets(sub.body);
    if (!bullets.length) return `### ${sub.label}\n\n- 本节要点请以教材原文为准。`;
    return `### ${sub.label}\n\n${bullets.map((b) => `- ${b}`).join("\n")}`;
  });
  return `## 这一关你要带走什么

${bookLede(title, subs)}

${blocks.join("\n\n")}

### 记住一句

> ${quote}
`;
}

function buildBookMindmap(title: string, subs: BookSection[], index: number): MindNode {
  const children = subs.slice(0, 10).map((sub, i) => ({
    id: `b-${index}-${i}`,
    label: compact(sub.label, 20),
    children: bookBullets(sub.body)
      .slice(0, 4)
      .map((point, j) => ({
        id: `bk-${index}-${i}-${j}`,
        label: compact(point, 24),
      })),
  }));
  return { id: `c${index}`, label: compact(title, 14), children };
}

function bookQuote(body: string, subs: BookSection[]) {
  const candidate = sentences(body).find(
    (s) => /本质|核心|关键|前提|必须|禁止|不要|不能|唯一/.test(s) && s.length < 60,
  );
  if (candidate) return candidate;
  const first = subs[0]?.body || "";
  return sentences(first).find((s) => s.length > 10 && s.length < 48) || "先理解这一章要解决的问题，再把每个小节的结论用到业务判断上。";
}

/** 教材案例 = 假设的真实交易：主角 + 账期/金额 + 决策点，结论回到教材小节 */
function writeBookCases(title: string, subs: BookSection[]): GeneratedCase[] {
  const topic = compact(title, 14);
  const secA = subs[0]?.label || "本章第一节";
  const secB = subs[1]?.label || "本节要点";
  return [
    {
      title: `假设交易：${topic} 怎么落到一笔真实业务上`,
      scene: `你在一家以赊销为主的公司管资金：下游买方账期普遍 60～90 天，账面应收账款越积越多，公司现金流紧张、又缺抵押物，传统贷款批不下来。财务建议按教材这一章的办法，把这批应收账款盘活成融资。`,
      analysis: `先别急着操作。对照教材小节「${secA}」核条件：这批应收款是否来自真实交易、是否可合法转让、债务人（买方）的付款信用怎么样。三项都站得住，方向才成立；任何一项对不上都不能继续。`,
    },
    {
      title: `最容易忽略的边界：${compact(secB.replace(/^\d+(?:\.\d+)*\s*/, ""), 12)}`,
      scene: `还是同一批业务：其中一笔应收款对应的订单正在质量争议中，买方拒绝全额确认。为了赶在季末拿到资金，有人建议先按全额申报、把争议往后放。`,
      analysis: `这正是 ${topic} 一章最容易被忽略的地方：教材强调应收款必须基于真实交易、债务关系清楚。订单有争议、金额未被确认，这笔应收的实现性不确定，不能按全额做。先把争议处理完，再谈这笔钱的事。`,
    },
  ];
}

function writeBookQuestions(title: string, subs: BookSection[], quote: string): GeneratedQuestion[] {
  const first = subs[0]?.label?.replace(/^\d+(?:\.\d+)*\s*/, "") || title;
  const core = compact(first, 20);
  const mainQuote = compact(quote, 48);
  return [
    {
      type: "single",
      stem: `学完教材「${core}」这一节，更准确的理解是？`,
      options: [
        `它解决的是真实业务里一个具体问题，要能讲清成立条件和边界`,
        "把名词和定义背下来就够了，业务判断靠经验",
        "教材只是参考，实际以个人理解为准",
        "所有业务场景都可以直接套用同一套说法",
      ],
      answer: [0],
      explanation: `按教材本小节结论理解「${core}」，要落到业务怎么判断，而不是背句子。`,
    },
    {
      type: "judge",
      stem: `把教材「${core}」当成概念名词记住，就算掌握了这一节。`,
      options: ["正确", "错误"],
      answer: [1],
      explanation: "这一节的知识最终要能判断真实业务，光记住名词不够。",
    },
    {
      type: "multi",
      stem: `学「${title}」这一章，应同时抓住哪些？（多选）`,
      options: [
        "它解决什么业务问题",
        "成立的边界与前提",
        "关键概念、依据与数据",
        "操作系统的细节和界面",
      ],
      answer: [0, 1, 2],
      explanation: "前三个共同构成可用的判断框架，操作细节不属于知识教材的要点。",
    },
    {
      type: "single",
      stem: `把这一章的知识用到一个真实的赊销融资场景前，最应该先确认什么？`,
      options: [
        "应收款是否来自真实交易、能否合法转让，债务方信用如何",
        "合同文本是否够漂亮",
        "公司规模是不是足够大",
        "对方报表上的利润是不是最高",
      ],
      answer: [0],
      explanation: "教材的关键前提是真实交易与债务人付款能力，先核这两点再谈方案。",
    },
    {
      type: "judge",
      stem: quote.includes("不要") || quote.includes("不能") || quote.includes("禁止")
        ? `结合教材判断：${mainQuote}`
        : `学完「${core}」，判断一句：${mainQuote}。`,
      options: ["正确", "错误"],
      answer: [1],
      explanation: quote,
    },
  ];
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
  const isTitleish = (x: string) =>
    /^(第[一二三四五六七八九十百\d]+[章节关部分]|附录|前言|目录)/u.test(x) ||
    /^[0-9]+(?:\.[0-9]+)+\s/u.test(x) ||
    /（优先级P\d+）|编制说明/u.test(x);
  const s = sentences(body).find((x) => !isTitleish(x) && x.length > 10 && x.length < 40);
  return s || `先搞懂教材里「${title}」这一章要解决的问题，再看各小节怎么用。`;
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
    .split(/[。！？!?\n]+/)
    .map((s) => s.replace(/^\s*[-–—―－•·、#]+\s*/, "").replace(/\s+/g, " ").trim())
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
