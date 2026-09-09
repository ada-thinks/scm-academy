import { GOLD_STYLE } from "./teach";
import type { GeneratedCase, GeneratedQuestion } from "./types";
import { BIZ_OPTIONS } from "./case-types";
import type { BizType, CaseEngineParams, CaseMeta, CasePack } from "./case-types";

/**
 * 实战案例引擎
 * ==============
 * 思路：把「真实感数字」交给确定性引擎（JS 计算），把「业务叙事与风控判断」交给大模型。
 * 这样演示时生成的案例/计算题 100% 数字正确，同时文风对齐内置示例课。
 *
 * - 有 Key：scene / analysis / 风控题由大模型生成，但题干中出现的利息、服务费、
 *   综合成本等一律引用引擎算好的指标，禁止模型自行重算 → 文案生动且数字可信。
 * - 无 Key：全套走本地模板（参数插值），同样产出结构完整的可闯关案例。
 *
 * 类型与常量定义见 ./case-types（客户端组件也会引用，须保持纯净）。
 */

type Metrics = {
  interestWan: number;
  serviceWan: number;
  totalWan: number;
  /** 综合融资成本占金额的比例（用于文案） */
  costRatio: number;
};

/* ------------------------------------------------------------------ */
/* 入口：优先 AI，失败或没 Key 自动降级本地模板                          */
/* ------------------------------------------------------------------ */

export async function buildCasePack(params: CaseEngineParams): Promise<CasePack> {
  const metrics = computeMetrics(params);
  const calcQuestion = buildCalcQuestion(params, metrics);

  try {
    const { pack, usedAi } = await buildWithAi(params, metrics);
    // AI 只负责业务叙事与风控判断题；计算题永远用引擎结果，保证数字正确
    const aiQuestions = normalizeQuestions(pack.questions).slice(0, 2);
    // AI 内容残缺时整体回退本地模板，避免挂载出不完整的案例
    if (pack.case.scene.trim().length < 60 || !pack.case.analysis.trim() || aiQuestions.length === 0) {
      throw new Error("AI 内容不完整");
    }
    return { usedAi, case: pack.case, questions: [calcQuestion, ...aiQuestions] };
  } catch (error) {
    console.error("[case-engine] AI 生成失败，降级本地模板", error);
  }
  const local = buildLocalCase(params, metrics);
  return { usedAi: false, case: local.case, questions: [calcQuestion, ...local.questions], meta: metaFromParams(params) };
}

/* ------------------------------------------------------------------ */
/* 引擎计算（确定性，不出错）                                            */
/* ------------------------------------------------------------------ */

function computeMetrics(p: CaseEngineParams): Metrics {
  const interestWan = (p.amountWan * p.rateBp * p.tenorDays) / 10000;
  const serviceWan = (p.amountWan * p.serviceBp) / 1000;
  const totalWan = interestWan + serviceWan;
  const costRatio = p.amountWan > 0 ? totalWan / p.amountWan : 0;
  return { interestWan, serviceWan, totalWan, costRatio };
}

function fmt(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, "");
}

/** 业务画像：封面色 emoji + 参数芯片（学员端卷宗卡同款展示） */
function metaFromParams(p: CaseEngineParams): CaseMeta {
  const biz = BIZ_OPTIONS.find((o) => o.value === p.bizType);
  const chips: CaseMeta["chips"] = [];
  const add = (label: string, value: string) => chips!.push({ label, value });
  add("业务", biz ? `${biz.emoji} ${biz.label}` : "供应链金融");
  add("融资金额", `${p.amountWan} 万元`);
  add("账期", `${p.tenorDays} 天`);
  if (p.rateBp > 0) add("日费率", `万${p.rateBp}`);
  if (p.serviceBp > 0) add("服务费", `${p.serviceBp}‰`);
  if (p.rating) add("买方评级", p.rating);
  return { emoji: biz?.emoji ?? "🧾", bizType: p.bizType, chips };
}

function buildCalcQuestion(p: CaseEngineParams, m: Metrics): GeneratedQuestion {
  // 选项数值全部由引擎本地计算；正确值显式插入随机位，保证答案下标与位置一致
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const correct = round2(m.totalWan);
  const wrongA = round2(m.interestWan); // 忘加服务费
  const wrongB = round2((p.amountWan * p.rateBp * p.tenorDays * 0.5) / 10000 + m.serviceWan); // 把日费率当“月”费率，少算一半
  const wrongC = round2(m.totalWan * 0.1); // 小数点错位
  let wrongs = [wrongA, wrongB, wrongC].filter((n, i, arr) => arr.indexOf(n) === i && n !== correct);
  if (!wrongs.length) wrongs = [round2(correct + 0.37), round2(correct * 0.5)];
  const slot = p.tenorDays % (wrongs.length + 1); // 正确项位置随账期变化，避免永远固定在 A
  const pool = [...wrongs];
  pool.splice(slot, 0, correct);
  const options = pool.map((n) => `${fmt(n)} 万元`);

  return {
    type: "single",
    stem: `${p.borrower} 以对 ${p.counterparty} 的应收账款做${bizName(p.bizType)}，融资 ${p.amountWan} 万元、占用 ${p.tenorDays} 天；日费率万分之 ${p.rateBp}，另按融资金额一次性收取服务费 ${p.serviceBp}‰。请估算这笔融资的综合成本约为多少万元？`,
    options,
    answer: [slot],
    explanation:
      `利息 = ${p.amountWan}万 × ${p.rateBp}/10000 × ${p.tenorDays}天 = ${fmt(m.interestWan)} 万；` +
      `服务费 = ${p.amountWan}万 × ${p.serviceBp}‰ = ${fmt(m.serviceWan)} 万；` +
      `合计 ≈ ${fmt(m.totalWan)} 万元。干扰项来自常见错法：忘加服务费、把日费率当成月费率（少算一半）、小数点错位。`,
  };
}

/* ------------------------------------------------------------------ */
/* 本地模板：三种题型 + 按业务类型的叙事                                  */
/* ------------------------------------------------------------------ */

function buildLocalCase(p: CaseEngineParams, m: Metrics): { case: GeneratedCase; questions: GeneratedQuestion[] } {
  const k = p.bizType;
  const scene = localScene(p, m);
  const analysis = localAnalysis(p, m);
  const judgment = localJudge(p);
  return {
    case: {
      title: `实战案例 · ${localAction(k)}：${p.borrower} 的这笔融资该不该放？`,
      scene,
      analysis,
    },
    questions: [judgment, localRiskMulti(k)],
  };
}

function localAction(k: BizType) {
  const map: Record<BizType, string> = {
    factoring: "一笔保理",
    order: "一笔订单融资",
    inventory: "一笔存货质押",
    lc: "一笔信用证融资",
  };
  return map[k];
}

/**
 * scene 内容约定（案例卷宗卡的解析契约）：
 * - 段落间用空行分隔（一段旁白 / 一段对话 / 一段旁白）；
 * - 对话每一句独占一行，行首为「角色名：」；
 * - 旁白行绝不以短前缀加冒号开头（避免被误判成对话）。
 */
function localScene(p: CaseEngineParams, m: Metrics): string {
  const currency = `${p.amountWan} 万元`;
  const how =
    p.bizType === "factoring"
      ? `${p.borrower} 把对 ${p.counterparty} 的一笔应收账款（${currency}、账期 ${p.tenorDays} 天）转让给资金方，回款账户改为双方共管，到期由 ${p.counterparty} 直接回款给资金方。`
      : p.bizType === "order"
        ? `${p.counterparty} 向 ${p.borrower} 下了 ${currency} 的采购订单并约定账期 ${p.tenorDays} 天，${p.borrower} 资金被压在备料上，申请凭订单做融资用于预付上游货款，专款专用、受托支付。`
        : p.bizType === "inventory"
          ? `${p.borrower} 以自有存货（货值 ${currency}）质押融资，货物交由第三方监管仓库保管，按核定货值折扣放款，出库需监管方审批放行，账期 ${p.tenorDays} 天。`
          : `${p.counterparty} 开立以 ${p.borrower} 为受益人的信用证，金额 ${currency}、装运期 ${p.tenorDays} 天；${p.borrower} 资金周转吃紧，想凭信用证做装运前融资。`;

  const intro = `${p.borrower} 主营制造/贸易，客户结构与回款节奏一般，最近三个月回款逾期天数在 3~15 天之间波动。采购、销售、仓储分属不同负责人，财务只在月底核对账期。${how}`;

  const dialogue = [
    `资金方风控老周：${p.amountWan} 万元、账期 ${p.tenorDays} 天，粗算下来综合成本约 ${fmt(m.totalWan)} 万（利息 ${fmt(m.interestWan)} 万 + 服务费 ${fmt(m.serviceWan)} 万）。数字不吓人，我担心的是回款路径锁不锁得住。`,
    `融资方财务总监：${p.counterparty} 愿意盖章确权，回款账户也可以按你们要求共管，账期能不能别卡得这么死？`,
    `资金方风控老周：确权、账户共管、人行登记，三步缺一不可。评级 ${p.rating} 我认，但额度先按 7~8 折核，账期一天不让。`,
    `买方采购总监：确权函可以出，前提是别催我们提前付款，${p.tenorDays} 天到点再回款。`,
  ].join("\n");

  const verdict = `最后，资金方把「确权回执、回款账户共管、人行转让登记」列为放款前置条件，并给融资额度设了 7~8 折上限。一句话收口：${p.borrower} 这笔 ${p.amountWan} 万元的生意不是不能做，而是要在回款路径被锁死之前，一分钱都不先放。`;

  return `${intro}\n\n${dialogue}\n\n${verdict}`;
}

function localAnalysis(p: CaseEngineParams, m: Metrics): string {
  const weakRating = /^(BB|B|C|BBB|CCC)/i.test(p.rating);
  const step = (s: string) => s;
  return (
    `这笔钱不是不能放，而是不能"按表面金额全放"。下一步动作：\n` +
    `1. ${step(`核实底层交易：调取订单/发票/发货签收三单，确认交易真实、无重复融资（人行登记）。`)}\n` +
    `2. ${step(`额度打折 + 期限对齐：按账期 ${p.tenorDays} 天核定占用期，融资额度按应收/货值 7~8 折设上限，要求 ${p.counterparty} 确权并将回款账户共管。`)}\n` +
    `3. ${weakRating ? `评级 ${p.rating} 偏弱：要求追加担保或缩短账期，单笔不超过 ${p.amountWan} 万的 50%。` : `评级 ${p.rating} 尚可：综合成本 ${fmt(m.totalWan)} 万元（约 ${(m.costRatio * 100).toFixed(1)}% 折算年化需按实际占用期测算），价格可以谈，但折扣、共管、回款校验一条不能少。`}`
  );
}

function localJudge(p: CaseEngineParams): GeneratedQuestion {
  return {
    type: "judge",
    stem: `即使 ${p.counterparty}（评级 ${p.rating}）口头承诺会按时付款，资金方也应先完成确权、账户共管与登记后再放款。`,
    options: ["正确", "错误"],
    answer: [0],
    explanation: "风控不是赌对方讲信用，而是把回款路径锁死：确权防重复融资、账户共管防资金挪用、登记防再转让。口头承诺不能替代流程控制。",
  };
}

function localRiskMulti(k: BizType): GeneratedQuestion {
  const stems: Record<BizType, [string, string[], number[]]> = {
    factoring: [
      "为降低这笔保理融资的风险，以下做法合理的是：",
      ["让买方书面确权并确认到期付款路径", "允许融资方保留对回款账户的单方支配权", "到人行登记系统做应收账款转让登记", "跳过发票验真，凭口头订单放款"],
      [0, 2],
    ],
    order: [
      "为控制订单融资风险，放款前应做到：",
      ["核对采购订单与历史交易真实性", "货款受托支付给指定上游供应商", "把融资款直接打给借款人自由支配", "以订单取消风险为由上调额度过量放款"],
      [0, 1],
    ],
    inventory: [
      "存货质押监管中，以下做法合理的是：",
      ["第三方监管仓库独立核定出入库与放行", "借款人可凭自身系统记录自行出库", "定期盘点并核对账面、实物与质押清单", "质押货物与借款人自营货物混放不区分"],
      [0, 2],
    ],
    lc: [
      "信用证项下融资，风险控制要点包括：",
      ["核对信用证条款与单据是否相符", "关注开证行资信与所在国风险", "只要拿到信用证就无须再看单据", "接受转让信用证而不做后续背书审查"],
      [0, 1],
    ],
  };
  const [stem, options, answer] = stems[k];
  return {
    type: "multi",
    stem,
    options: [...options],
    answer: [...answer],
    explanation:
      k === "factoring"
        ? "确权与登记是防重复融资的核心，回款路径必须共管。让融资方单方支配账户、凭口头订单放款都是典型踩坑动作。"
        : k === "order"
          ? "订单融资必须回到真实交易与受托支付，防止资金挪用与虚假订单。"
          : k === "inventory"
            ? "存货质押的命门是监管独立性：第三方监管 + 定期盘点，借款人不能自行出库，质押货不能混放。"
            : "信用证融资既看单据是否相符，也看开证行资信；拿到信用证不等于零风险。",
  };
}

/* ------------------------------------------------------------------ */
/* AI 通路：scene / analysis / 风控题（不负责计算）                      */
/* ------------------------------------------------------------------ */

async function buildWithAi(p: CaseEngineParams, m: Metrics): Promise<{ pack: CasePack; usedAi: true }> {
  const { loadAiSettings } = await import("./ai");
  const settings = await loadAiSettings();
  if (!settings.apiKey?.trim()) throw new Error("NO_AI");

  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl.replace(/\/$/, ""),
    timeout: 120000,
  });

  const numbers = [
    `融资对象：${p.borrower}`,
    `交易对手：${p.counterparty}（评级 ${p.rating}）`,
    `金额：${p.amountWan} 万元，占用 ${p.tenorDays} 天`,
    `日费率：万分之 ${p.rateBp}；一次性服务费：${p.serviceBp}‰`,
    `引擎已算好（直接引用，禁止自行重算）：利息 ${fmt(m.interestWan)} 万元，服务费 ${fmt(m.serviceWan)} 万元，综合成本 ${fmt(m.totalWan)} 万元`,
  ].join("\n");

  const shape = `输出 JSON：{"case":{"title","scene","analysis"},"questions":[{"type":"single|multi|judge","stem","options":[],"answer":[下标],"explanation"}]}`;

  const content = `业务类型：${bizName(p.bizType)}。\n${numbers}\n\n要求：\n` +
    `1. scene 写成一段"可上演示台"的迷你剧本：开头一段旁白交代企业现状与业务（用空行分段）；中段至少 3 句角色对话，每句独占一行、以"角色名："开头（角色用职务全称，如 资金方风控老周 / 融资方财务总监 / 买方采购经理，姓名可杜撰但职务要写全），对话要自然带出确权、账户共管、人行登记、监管放行等流程动作和引擎给定的数字，冲突要有"岗位或流程的真实拉扯"；结尾一段旁白收口。禁止把多句对话挤进同一行，旁白行不得以"某人说：某事"形式开头。\n` +
    `2. analysis：给出"该不该放、怎么放"，3 步以内，落到可执行动作；评级 ${p.rating} ${/^(BB|B|C|CCC)/i.test(p.rating) ? "偏弱，须收紧" : "尚可，但折扣与共管一条不少"}。\n` +
    `3. questions 只出 1 道 multi（考风控动作，4 个选项、答案 2 个）和 1 道 judge（options 固定 ["正确","错误"]），全部围绕本案例业务，禁止任何需要算数的计算题，禁止自己编数字。\n` +
    `${shape}\n只输出 JSON。`;

  const raw = await requestJson<{
    case: Partial<GeneratedCase>;
    questions?: GeneratedQuestion[];
  }>(client, settings.model, [
    { role: "system", content: `${GOLD_STYLE}\n你现在是供应链金融风控专家，负责把一个业务参数写成「带数字、带拉扯、带下一步」的实战案例。` },
    { role: "user", content },
  ], 0.45);

  const c = raw.case || {};
  const cases: GeneratedCase = {
    title: String(c.title || `实战案例 · ${bizName(p.bizType)}：${p.borrower} 的这笔融资该不该放？`),
    scene: String(c.scene || ""),
    analysis: String(c.analysis || ""),
  };
  return { pack: { usedAi: true, case: cases, questions: normalizeQuestions(raw.questions), meta: metaFromParams(p) }, usedAi: true };
}

function bizName(k: BizType) {
  return BIZ_OPTIONS.find((o) => o.value === k)?.label || "保理融资";
}

/* ------------------------------------------------------------------ */
/* 校验净化（挂库前调用）                                                */
/* ------------------------------------------------------------------ */

export function normalizeQuestions(input: GeneratedQuestion[] | undefined): GeneratedQuestion[] {
  const mapped = (input || []).map((raw) => {
    const q = raw as GeneratedQuestion & { question?: string; title?: string };
    const type = q.type === "multi" || q.type === "judge" ? q.type : "single";
    const options = Array.isArray(q.options) && q.options.length >= 2
      ? q.options.map((o) => String(o).trim()).filter(Boolean)
      : type === "judge"
        ? ["正确", "错误"]
        : ["A", "B"];
    if (type === "judge") {
      return {
        type,
        stem: String(q.stem || q.question || q.title || "").trim(),
        options: ["正确", "错误"],
        answer: [0],
        explanation: String(q.explanation || ""),
      } satisfies GeneratedQuestion;
    }
    const answer = Array.isArray(q.answer)
      ? Array.from(new Set(q.answer.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < options.length)))
      : [];
    const finalAnswer = answer.length ? answer : [0];
    return {
      type,
      stem: String(q.stem || q.question || q.title || "").trim(),
      options,
      answer: finalAnswer,
      explanation: String(q.explanation || ""),
    } satisfies GeneratedQuestion;
  });
  return mapped.filter((q) => q.stem && q.options.length >= 2);
}

export function normalizePack(pack: CasePack): CasePack {
  const meta = pack.meta;
  return {
    usedAi: Boolean(pack.usedAi),
    case: {
      title: String(pack.case.title || "实战案例").trim(),
      scene: String(pack.case.scene || "").trim(),
      analysis: String(pack.case.analysis || "").trim(),
    },
    questions: normalizeQuestions(pack.questions),
    meta: meta
      ? {
          emoji: String(meta.emoji || "🧾"),
          bizType: meta.bizType,
          chips: Array.isArray(meta.chips)
            ? meta.chips
                .filter((c) => c && c.label && c.value)
                .map((c) => ({ label: String(c.label), value: String(c.value) }))
            : undefined,
        }
      : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* 大模型 JSON 请求与容错解析（与 ai.ts 一致，避免跨模块导出）           */
/* ------------------------------------------------------------------ */

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function requestJson<T>(
  client: InstanceType<typeof import("openai").default>,
  model: string,
  messages: ChatMessage[],
  temperature: number,
): Promise<T> {
  const request = { model, temperature, messages };
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
  const attempts = [stripped];
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) attempts.push(stripped.slice(start, end + 1));
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* try next */
    }
  }
  throw new Error("模型返回内容无法解析");
}

function stripFence(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : trimmed;
}
