import { Markdown } from "./Markdown";

/**
 * 案例「卷宗卡」：封面 + 对话气泡 + 风控签批
 *
 * scene 解析契约（与 src/lib/case-engine.ts 的文案约定配套）：
 *  - 段落之间用空行分隔；
 *  - 对话每一句独占一行，行首为「角色名：」（角色名 ≤ 12 个字符）；
 *  - 旁白行不得以「短前缀 + 冒号」开头（否则会被误判成对话）；
 *  - 旧数据 / 样例课无对话格式时自动整段降级为旁白，不会报错。
 *
 * 无服务端依赖：管理员预览（客户端）与学员关卡（服务端）共用。
 */

type DossierChip = { label: string; value: string };

type Props = {
  title: string;
  scene: string;
  analysis: string;
  /** 页眉小标，如「实战案例 · 1 / 2」 */
  kicker?: string;
  /** 业务参数芯片 */
  chips?: DossierChip[];
  /** 封面 emoji；缺省时按业务关键词从文案里猜 */
  coverEmoji?: string;
};

type Shot =
  | { kind: "narr"; text: string }
  | { kind: "talk"; speaker: string; text: string };

const TALK_RE = /^([^：:，。！？；\s][^：:，。！？；]{0,11})[：:]\s*(.+)$/;
/** 这些词结尾的"冒号前缀"是叙事不是说话人（防旧模板「资金方评审发现：…」被误判） */
const NOT_SPEAKER = /(发现|显示|表明|说明|如下|总结|结论|要点|提醒|注意|前提|关键|核心|建议|风险|问题|原因|结果|难点|思路|流程|步骤|方式|方法|原则|总述|背景|现状)$/;

/** 把文案拆成镜头：旁白块与对话气泡按原文顺序排列 */
function parseShots(scene: string): Shot[] {
  const shots: Shot[] = [];
  const narr: string[] = [];
  const flush = () => {
    if (narr.length) {
      shots.push({ kind: "narr", text: narr.join("\n").trim() });
      narr.length = 0;
    }
  };
  for (const raw of scene.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const match = TALK_RE.exec(line);
    const speaker = match?.[1]?.trim() ?? "";
    const text = match?.[2]?.trim() ?? "";
    const plausible =
      !!match &&
      text.length >= 2 &&
      speaker.length >= 2 &&
      !NOT_SPEAKER.test(speaker) &&
      /[\u4e00-\u9fa5]/.test(speaker);
    if (plausible) {
      flush();
      shots.push({ kind: "talk", speaker, text });
    } else {
      narr.push(line);
    }
  }
  flush();
  return shots.length ? shots : [{ kind: "narr", text: scene }];
}

const COVER_RULES: [RegExp, string][] = [
  [/(保理|应收账款|债权转让|受让)/, "🧾"],
  [/(信用证|单证|开证|议付|承兑)/, "🌐"],
  [/(票据|商业承兑|银行承兑|贴)/, "🎫"],
  [/(订单融资|采购订单|受托支付|预付)/, "📦"],
  [/(存货|质押|监管仓|仓储监管|货值)/, "🏭"],
  [/(芯片|缺货|呆滞|SKU|安全库存|MOQ)/, "🧩"],
  [/(盘点|仓库|库存|物流|承运|运输)/, "🚚"],
  [/(供应商|比价|寻源|采购)/, "🛒"],
];
function resolveCoverEmoji(coverEmoji: string | undefined, title: string, scene: string): string {
  if (coverEmoji) return coverEmoji;
  const hay = `${title}\n${scene}`;
  for (const [rule, emoji] of COVER_RULES) {
    if (rule.test(hay)) return emoji;
  }
  return "📁";
}

const AVATAR_RULES: [RegExp, string][] = [
  [/资金方|风控|评审|保理商|授信|银行/, "🕵️"],
  [/融资方|借款人|财务|出纳|资金部/, "💼"],
  [/买方|客户|采购|下单/, "🛍️"],
  [/销售|业务员|跟单/, "📣"],
  [/仓储|仓库|监管方|监管/, "📦"],
  [/供应商|卖方/, "🏭"],
  [/担保|法务|律师/, "⚖️"],
];
function avatarFor(speaker: string): string {
  for (const [rule, emoji] of AVATAR_RULES) {
    if (rule.test(speaker)) return emoji;
  }
  return "🗣️";
}

export function CaseDossier({ title, scene, analysis, kicker, chips, coverEmoji }: Props) {
  const emoji = resolveCoverEmoji(coverEmoji, title, scene);
  const shots = parseShots(scene);
  return (
    <article className="card overflow-hidden rounded-3xl">
      <div className="h-1.5 bg-gradient-to-r from-sea via-primary to-gold" />
      <div className="p-5">
        {/* 封面 */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sea to-primary p-5 text-white">
          <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full border-[14px] border-white/10" aria-hidden />
          <div className="pointer-events-none absolute -bottom-12 right-16 h-28 w-28 rounded-full border border-white/10" aria-hidden />
          <div className="pointer-events-none absolute right-4 top-4 h-6 w-6 rounded-full bg-white/10" aria-hidden />
          <div className="relative flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/15 text-4xl leading-none shadow-inner">
              {emoji}
            </div>
            <div className="min-w-0">
              {kicker && (
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/75">{kicker}</p>
              )}
              <h3 className="mt-1 text-lg font-extrabold leading-snug xl:text-xl">{title}</h3>
            </div>
          </div>
        </div>

        {/* 业务芯片 */}
        {chips && chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip.label}
                className="rounded-full bg-neutral-bg px-2.5 py-1 text-xs text-neutral-text"
              >
                <b className="font-semibold text-ink">{chip.value}</b>　{chip.label}
              </span>
            ))}
          </div>
        )}

        {/* 剧情镜头 */}
        <div className="mt-5 space-y-3.5">
          {shots.map((shot, index) =>
            shot.kind === "narr" ? (
              <div key={index} className="flex items-start gap-2.5">
                <span className="mt-0.5 text-base" aria-hidden>🎬</span>
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-7 text-neutral-text">
                  {shot.text}
                </p>
              </div>
            ) : (
              <div key={index} className="flex items-start gap-2.5">
                <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-neutral-border bg-white text-lg shadow-sm" aria-hidden>
                  {avatarFor(shot.speaker)}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-mist">{shot.speaker}</p>
                  <p className="mt-1 w-fit max-w-[94%] whitespace-pre-wrap rounded-2xl rounded-tl-md border border-neutral-border bg-white px-3.5 py-2.5 text-sm leading-6 text-ink shadow-sm">
                    {shot.text}
                  </p>
                </div>
              </div>
            ),
          )}
        </div>

        {/* 风控签批 */}
        {analysis.trim() && (
          <div className="relative mt-5">
            <div className="rounded-2xl border-l-4 border-gold bg-sand px-5 py-4">
              <p className="text-[11px] font-bold tracking-[0.28em] text-gold">风控签批</p>
              <div className="dossier-analysis mt-2 text-sm leading-7 text-ink">
              <Markdown source={analysis} />
            </div>
            </div>
            <div
              className="pointer-events-none absolute bottom-8 right-7 grid h-16 w-16 -rotate-12 place-items-center rounded-full border-2 border-gold/80 text-center text-[11px] font-bold leading-tight tracking-widest text-gold/90"
              aria-hidden
            >
              风控
              <br />
              已审批
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
