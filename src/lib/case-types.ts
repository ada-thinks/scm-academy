import type { GeneratedCase, GeneratedQuestion } from "./types";

/**
 * 实战案例引擎：纯类型与常量
 * 本文件不依赖任何服务端运行时（prisma / openai），客户端与服务端均可安全 import。
 */

export type BizType = "factoring" | "order" | "inventory" | "lc";

export const BIZ_OPTIONS: { value: BizType; label: string; emoji: string; desc: string }[] = [
  { value: "factoring", label: "保理融资", emoji: "🧾", desc: "应收账款转让 + 资金方共管回款" },
  { value: "order", label: "订单融资", emoji: "📦", desc: "凭采购订单申请预付款，专款专用" },
  { value: "inventory", label: "存货质押融资", emoji: "🏭", desc: "存货质押 + 第三方监管放行" },
  { value: "lc", label: "信用证结算融资", emoji: "🌐", desc: "单证相符、开证行承付下的装运前融资" },
];

export type CaseEngineParams = {
  bizType: BizType;
  /** 融资方 / 借款人 */
  borrower: string;
  /** 交易对手（买方 / 下单方 / 开证申请人） */
  counterparty: string;
  /** 融资金额（万元） */
  amountWan: number;
  /** 账期 / 资金占用天数 */
  tenorDays: number;
  /** 日费率（万分之 N） */
  rateBp: number;
  /** 一次性服务费（千分之 N） */
  serviceBp: number;
  /** 主体 / 买方评级 */
  rating: string;
};

export type CasePack = {
  usedAi: boolean;
  case: GeneratedCase;
  questions: GeneratedQuestion[];
  /** 业务元数据：封面 emoji + 参数芯片（随 pack 挂库，学员端复用） */
  meta?: CaseMeta;
};

/** 挂载到章节时随案例一起入库的业务画像 */
export type CaseMeta = {
  emoji: string;
  bizType?: BizType;
  chips?: { label: string; value: string }[];
};

export function defaultParams(): CaseEngineParams {
  return {
    bizType: "factoring",
    borrower: "深圳云帆智造有限公司",
    counterparty: "华信工业集团（买方）",
    amountWan: 300,
    tenorDays: 90,
    rateBp: 3,
    serviceBp: 2,
    rating: "AA",
  };
}
