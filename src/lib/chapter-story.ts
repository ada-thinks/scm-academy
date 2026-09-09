/**
 * 章节「认知主线」解析：
 * 把 notesMd 还原成自上而下的一串认知段（引言 → 痛点/机制/价值/… → 金句），
 * 每段 = 标题 + 内容 + 语义标签，供 ChapterJourney 逐屏渲染。
 */

export type StorySection = {
  tag: string;
  icon: string;
  title: string;
  body: string;
};

export type ChapterStory = {
  /** 「这一关你要带走什么」小节正文，作为 Hero 引言 */
  leadBody: string;
  /** 主线认知段（不含引言与金句） */
  sections: StorySection[];
  /** 「记住一句」金句 */
  quote?: string;
};

/** 段语义标签：按业务认知主线归类 */
const GROUPS: [RegExp, string, string][] = [
  [/(鸿沟|困境|痛点|顾虑|担忧|不信任|为什么存在|风险)/, "痛点", "它为什么存在"],
  [/(机制|原理|怎么解决|如何|三层|运作|流程|步骤|规则|安排|框架|运转|逻辑|闭环)/, "机制", "它怎么解决"],
  [/(价值|收益|作用|意义|好处|共赢|对谁)/, "价值", "它对谁有用"],
  [/(当事人|核心角色|角色|各方|是谁)/, "角色", "谁在场上"],
  [/(单据|单证|凭单|物权|载体|技术基础|前提)/, "基础", "靠什么落地"],
  [/(定义|概念|本质|含义|分类|类型|术语|结构)/, "概念", "先立住概念"],
];

function classify(title: string): { tag: string; icon: string } {
  for (const [rule, tag, why] of GROUPS) {
    if (rule.test(title)) {
      const icon = tag === "痛点" ? "🧩" : tag === "机制" ? "⚙️" : tag === "价值" ? "🎯" : tag === "角色" ? "🤝" : tag === "基础" ? "📄" : "🔑";
      return { tag: `${tag} · ${why}`, icon };
    }
  }
  return { tag: "延伸 · 再进一步", icon: "🧠" };
}

function normalize(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 只处理顶层小节：以 ## 为界；若全文无 ##，退化为 ### 为界 */
function splitTop(text: string): { title: string; body: string }[] {
  const parts = normalize(text).split(/(?=^#{1,3}\s+.+$)/m);
  return parts
    .map((part) => {
      const lines = part.trim().split("\n");
      const head = lines[0];
      const isHeading = /^#{1,3}\s+/.test(head || "");
      return {
        title: isHeading ? head.replace(/^#{1,3}\s+/, "").trim() : "",
        body: (isHeading ? lines.slice(1).join("\n") : lines.join("\n")).trim(),
      };
    })
    .filter((s) => s.body.length >= 20);
}

/** 从小节正文尾部剥离「记住一句」金句 */
function pullQuote(body: string): { body: string; quote?: string } {
  const m = body.match(/(?:^|\n)#{1,3}\s*记住一句[^\n]*\n+([\s\S]*)$/);
  if (!m) return { body };
  return {
    body: body.slice(0, m.index).trim(),
    quote: m[1].trim().replace(/^>\s*/, ""),
  };
}

export function chapterStory(notes: string): ChapterStory {
  const raw = splitTop(notes || "");
  let leadBody = "";
  let quote: string | undefined;

  const sections: StorySection[] = [];
  for (const part of raw) {
    const title = part.title;
    if (!title) {
      if (!leadBody) leadBody = part.body;
      continue;
    }
    if (/这一关你要带走|这一关解决什么|带走什么/.test(title)) {
      if (!leadBody) leadBody = part.body;
      continue;
    }
    if (/记住一句|记住|金句/.test(title)) {
      if (!quote) quote = part.body.replace(/^>\s*/, "");
      continue;
    }
    const { body, quote: q } = pullQuote(part.body);
    if (q && !quote) quote = q;
    if (!body.trim()) continue;
    const { tag, icon } = classify(title);
    sections.push({ tag, icon, title, body: body.trim() });
  }

  return { leadBody, sections, quote };
}

/** 去掉「第N关 · 」前缀，用于页面大标题 */
export function stripLevelPrefix(title: string) {
  return title.replace(/^第\s*\d+\s*关\s*[·•:：\-—\s]*/, "").trim() || title;
}
