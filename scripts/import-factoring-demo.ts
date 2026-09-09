/**
 * 线上保理业务示例数据：
 *  - 知识库按「一级标题=关卡」生成学习宝典（教材/脑图/案例/测验）
 *  - 操作手册解析为建档、报价、授信、资产、融资、兑付等流程，写入实操宝典
 * 可重复执行：先清理已有「线上保理」课程再重建。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { extractText } from "../src/lib/parse-document";
import { teachChapter, splitByTopChapters } from "../src/lib/teach";
import { persistCourse } from "../src/lib/seed";
import { saveSource } from "../src/lib/source-store";
import type { GeneratedCourse } from "../src/lib/types";

const BOOK_DIR = path.join(process.cwd(), "book");
const KB_FILE = "01 线上保理业务知识库.pdf（13页）.pdf";
const MANUAL_FILE = "线上保理操作手册（终稿·7页）.pdf";
const BUSINESS = "线上保理";

type FlowSeed = {
  title: string;
  goal: string;
  steps: { actor: string; title: string; detail: string[] }[];
};

/** 来自《线上保理操作手册》的真实流程，按原文提炼 */
const MANUAL_FLOWS: FlowSeed[] = [
  {
    title: "企业建档 · 内管端发起",
    goal: "内管人员在系统里为合作企业新增机构、发起建档并完成认证，企业即可登录开通线上保理。",
    steps: [
      {
        actor: "内管端",
        title: "新增机构（前置）",
        detail: [
          "进入「组织机构管理」，在机构树中右键根机构 → 选择「新增子级」。",
          "填写必填字段（机构名称、机构类型等），保存后即可在机构列表看到新机构。",
        ],
      },
      {
        actor: "内管端",
        title: "发起建档",
        detail: ["客户中心 →「客户信息维护」→ 点击「新增」。"],
      },
      {
        actor: "内管端",
        title: "选择认证方式",
        detail: [
          "根据业务需要选择认证方式：企业邀请 / 简易认证 / 平台认证。",
          "三种方式的适用场景见页面说明，可点击查看贴士。",
        ],
      },
      {
        actor: "内管端",
        title: "分步填写（共 4 步）",
        detail: [
          "基本信息：上传营业执照、企业授权书，填写必填字段（可点「同步工商信息」辅助）→ 下一步。",
          "企业资料：上传客户辅助资料（章程、财报、审计报告等，选填可跳过）→ 下一步。",
          "账户信息：点击「新增账户」，填写必填字段 → 下一步。",
          "产品开通：勾选需开通的产品（如线上保理），填写企业角色、协议签署方式等必填项 → 提交。",
        ],
      },
      {
        actor: "内管端",
        title: "内管审核",
        detail: [
          "客户中心 →「客户审核」→ 找到对应任务（企业认证审批）。",
          "点击「领取」→ 内管审核通过。",
        ],
      },
      {
        actor: "客户端",
        title: "客户确认",
        detail: [
          "使用新增企业的客户管理员手机号 + 验证码登录（测试环境默认验证码 123456）。",
          "首页点击「去确认」→ 信息确认页核对资料 → 下一步。",
          "完成管理员人脸认证（微信扫码，测试环境挡板默认通过）。",
          "签署 CFCA 数字证书服务协议 → 确认。",
        ],
      },
      {
        actor: "客户端",
        title: "开通成功",
        detail: [
          "产品中心 → 线上保理 →「签署协议」→ 阅读协议并勾选同意 → 签署。",
          "产品中心显示产品「已开通」，建档完成。",
        ],
      },
    ],
  },
  {
    title: "企业建档 · 客户端自助注册",
    goal: "企业自己注册并走自主认证，内管审核通过后签署协议即可开通，无需内管预先建档。",
    steps: [
      {
        actor: "客户端",
        title: "注册账号",
        detail: [
          "打开客户端登录页 → 点击「注册」。",
          "填写必填项（手机号、短信验证码、企业名称、设置密码、确认密码），勾选《用户协议》《隐私政策》→ 点「注册」。",
          "提示注册成功，自动进入产品中心。",
        ],
      },
      {
        actor: "客户端",
        title: "选择产品，开始企业认证",
        detail: [
          "产品中心找到「线上保理」→ 点「去开通」。",
          "进入「开始企业认证」页，确认认证企业无误（需备好营业执照、法定代表人身份证、被授权人身份证）→ 点「立即认证」。",
          "如为分支机构，点页面下方「如您为'分支机构'请点击此处」走分支流程。",
        ],
      },
      {
        actor: "客户端",
        title: "总公司认证（共 5 步）",
        detail: [
          "上传企业信息：上传营业执照 + 法定代表人证件（人像面、国徽面）。",
          "补充企业资料 → 添加银行账户 → 上传管理员信息。",
          "签署授权确认书：核对企业、法定代表人、代理人信息及授权事项（支持「更换签署方式」）。",
          "五步完成后自动进入审核，无需额外提交。",
        ],
      },
      {
        actor: "内管端",
        title: "内管审核",
        detail: [
          "内管端 →「客户审核」→ 找到该企业任务（企业认证审批 / 运营预审，认证方式：自主认证）。",
          "点击「领取」→ 内管审核通过。",
        ],
      },
      {
        actor: "客户端",
        title: "签署产品协议",
        detail: [
          "产品中心 → 线上保理显示「待签署」→ 点「签署协议」。",
          "阅读《线上保理产品及服务协议》→ 勾选「我已认真阅读并同意签署以上所有合同」→「下一步」完成签署。",
        ],
      },
      {
        actor: "客户端",
        title: "开通完成",
        detail: ["产品中心显示线上保理「已开通」，建档完成。"],
      },
    ],
  },
  {
    title: "报价配置（交易价格 + 服务费）",
    goal: "融资的前置准备：先配资金方收息的交易价格，再配平台收的服务费价格；未配置报价时系统会拦截融资。",
    steps: [
      {
        actor: "内管端",
        title: "配置交易价格",
        detail: [
          "内管端 → 顶部标签「交易价格维护」→ 点击「新增」（同页支持导入、按融资报价编号 / 资金方 / 核心企业查询）。",
          "填写必填项：资金方（用哪个资金方融资就选对应资金方）、账款剩余期限、融资金额、付息方式。",
          "融资利率类型：固定利率 / LPR 利率 / 接口获取（按项目实际对接选择）。",
          "融资利率（年化%）、融资比例（%）、保理服务费率及计算方式（如按年化）。",
          "报价生效日期、报价截止日期（生效期限自动计算）→ 点击「提交」。",
          "返回列表，状态「已生效」即报价可用；若需审批，可到「交易价格审批」处理。",
        ],
      },
      {
        actor: "内管端",
        title: "配置服务费价格",
        detail: [
          "顶部标签「服务费价格维护」→ 点击「新增」。",
          "填写必填项：核心企业、平台服务费率（年化%）、收费方式（银行代扣 / 线下收取）。",
          "服务费支付方：核心企业 / 融资方；服务费起息日：融资申请日 / 融资放款日。",
          "报价生效日期、报价截止日期 → 点击「提交」。",
          "返回列表状态「已生效」即配置可用；若需审批，可进入「服务费价格审批」审核。",
        ],
      },
    ],
  },
  {
    title: "授信额度配置（开单额度 + 融资额度）",
    goal: "给核心企业配置开单额度、给融资方配置融资额度，均需内管审批后生效。",
    steps: [
      {
        actor: "内管端",
        title: "新增开单额度",
        detail: [
          "内管端 → 额度中心 →「额度维护」→「线上保理开单额度」→ 点击「新增」。",
          "填写必填项：开单企业名称（选要做业务的核心企业）、开单企业类型、是否循环。",
          "开单额度、额度起始日、额度到期日（额度期限自动计算）→「提交」（也可先保存）。",
        ],
      },
      {
        actor: "内管端",
        title: "开单额度审批",
        detail: [
          "额度中心 →「额度审核」→ 待领取 → 找到对应申请（额度新增初审）。",
          "点击「领取」→ 审批通过。",
          "返回「额度维护 - 线上保理开单额度」，状态「已生效」即额度新增成功。",
        ],
      },
      {
        actor: "内管端",
        title: "新增融资额度",
        detail: [
          "额度中心 →「额度维护」→「线上保理融资额度」→「新增」。",
          "填写必填项：授信企业名称、授信企业类型、资金方、是否循环、融资额度。",
          "额度起始日、额度到期日（额度期限自动计算）→「提交」。",
        ],
      },
      {
        actor: "内管端",
        title: "融资额度审批",
        detail: [
          "到「额度审核」领取任务（额度新增初审）→ 审批通过。",
          "返回「线上保理融资额度」，数据流转到「已生效」即融资额度维护完成。",
        ],
      },
    ],
  },
  {
    title: "新增资产（账款确权）",
    goal: "核心企业提交账款、上传贸易资料并完成确权，形成可用于融资的资产。",
    steps: [
      {
        actor: "客户端·核心企业",
        title: "客户端登录",
        detail: ["使用核心企业账号登录（验证码登录，测试环境验证码 123456）。"],
      },
      {
        actor: "客户端·核心企业",
        title: "新增并提交账款",
        detail: [
          "业务中心 → 账款管理 →「资产维护」→ 点「新增」。",
          "「新增账款信息」弹窗：核心企业名称自动带出，选择供应商名称、资金方名称，填写账款金额、账款到期日 →「保存」。",
          "列表出现该账款（状态：未提交）→ 点「提交账款」，状态变为「待上传票据资料」。",
        ],
      },
      {
        actor: "内管端",
        title: "上传贸易资料",
        detail: [
          "内管端 →「资产维护」→ 找到该账款（待上传票据资料）→ 点「上传资料」。",
          "合同订单：点「新增」填写编号、名称、金额、签署 / 到期日期，上传合同订单影像（限 jpg / jpeg / png / pdf，单个 ≤50Mb）。",
          "发票信息：可开启「自动分配占用金额」，填写发票类型、号码、代码、金额、发票日期、本次占用金额，上传发票影像（单个 ≤500kb）。",
          "其他补充资料（发票清单、履约凭证、业务资质证书等）选填 → 点「提交」。",
          "提交后状态变为「确权中」。",
        ],
      },
      {
        actor: "客户端·核心企业",
        title: "账款确权",
        detail: [
          "业务中心 → 账款管理 →「账款确权」→ 待审核 → 点「办理」。",
          "确认账款信息（核对账款信息及贸易背景资料）→ 审批结果选「通过」→「提交」。",
          "签署付款承诺函：勾选同意 → 输入协议签署短信验证码（测试环境 123456）→「签署」。",
        ],
      },
      {
        actor: "系统",
        title: "完成",
        detail: ["状态变为「已确权」，新增资产完成，可发起融资。"],
      },
    ],
  },
  {
    title: "保理融资（申请 → 审核 → 签收 → 放款）",
    goal: "融资方用已确权账款发起融资，依次走内管审核、合同签署、资金方签收和放款审核后完成放款。",
    steps: [
      {
        actor: "客户端·融资方",
        title: "发起融资申请",
        detail: [
          "客户端登录融资方账号 → 线上保理 → 业务中心 →「融资申请」。",
          "选择已确权账款 → 确认融资信息 →「上传贸易背景资料」→「提交」。",
        ],
      },
      {
        actor: "内管端",
        title: "内管端审核",
        detail: [
          "线上保理 →「交易审核」→ 依次办理三个节点。",
          "运营预审 → 资产查验 → 风控审核。",
        ],
      },
      {
        actor: "客户端·融资方",
        title: "签署保理合同",
        detail: ["业务中心 →「合同签署」→ 待签署 →「上传」保理合同 →「签署」→ 签署成功。"],
      },
      {
        actor: "客户端·资金方",
        title: "资金方签收审核",
        detail: [
          "客户端登录资金方账号 → 业务中心 →「签收审核」→ 待办理。",
          "点「办理」→ 审批通过 → 提交。",
        ],
      },
      {
        actor: "客户端·资金方",
        title: "放款审核",
        detail: [
          "放款中心 →「放款审核」→「办理」（一级审核）。",
          "核对放款信息 → 审批通过 → 提交。",
        ],
      },
      {
        actor: "系统",
        title: "完成",
        detail: [
          "查询中心 →「账款查询」→ 账款已融资。",
          "已融金额 = 融资金额，剩余可融金额 = 0。",
        ],
      },
    ],
  },
  {
    title: "保理还款（账款兑付）",
    goal: "账款到期后核心企业确认已线下兑付，系统自动流转完成兑付与结清。",
    steps: [
      {
        actor: "客户端·核心企业",
        title: "进入账款兑付",
        detail: [
          "核心企业登录客户端 → 业务中心 → 账款管理 →「账款兑付」。",
          "在「待兑付 / 已到期」标签查看已到期的兑付单。",
        ],
      },
      {
        actor: "客户端·核心企业",
        title: "确认兑付",
        detail: [
          "找到该兑付单 → 点「确认兑付」。",
          "按提示先完成线下兑付 → 选择付款日期 → 确定。",
          "操作成功，兑付状态变为「兑付中」（后续由系统自动流转）。",
        ],
      },
      {
        actor: "系统",
        title: "兑付完成",
        detail: [
          "系统自动处理完成后，状态变为「兑付成功」，进入「已结清」标签页。",
          "可下载银行回单 / 交易回单。",
        ],
      },
    ],
  },
];

async function buildLearningCourse(kbText: string): Promise<GeneratedCourse> {
  const filename = KB_FILE;
  const sections = splitByTopChapters(kbText);
  const chapters = sections.map((section, index) =>
    teachChapter(index, section.title, section.body, filename),
  );
  return {
    title: BUSINESS,
    description:
      "从定义、分类、交易机制到业务流程与风控逐关精讲；配套「实操宝典」覆盖建档、报价、授信、资产、融资、兑付全流程。",
    coverEmoji: "📋",
    chapters,
  };
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) throw new Error("找不到 admin 用户，请先跑 npm run db:seed");

  // 幂等：先清掉旧的「线上保理」课程（连同学习进度与实操流程）
  const prev = await prisma.course.findFirst({ where: { business: BUSINESS } });
  if (prev) {
    console.log(`清理旧课程：${prev.title} (${prev.id})`);
    await prisma.$transaction(async (tx) => {
      await tx.attempt.deleteMany({ where: { chapter: { courseId: prev.id } } });
      await tx.caseStudy.deleteMany({ where: { chapter: { courseId: prev.id } } });
      await tx.question.deleteMany({ where: { chapter: { courseId: prev.id } } });
      await tx.progress.deleteMany({ where: { courseId: prev.id } });
      await tx.manualFlow.deleteMany({ where: { courseId: prev.id } });
      await tx.chapter.deleteMany({ where: { courseId: prev.id } });
      await tx.course.delete({ where: { id: prev.id } });
    });
  }

  // —— 学习宝典：知识库按一级标题拆关 ——
  const kbBuffer = await readFile(path.join(BOOK_DIR, KB_FILE));
  const kbText = await extractText(KB_FILE, kbBuffer);
  console.log(`知识库已读取 ${kbText.length} 字符`);
  const learning = await buildLearningCourse(kbText);
  console.log(`将按一级标题生成 ${learning.chapters.length} 个关卡`);
  const course = await persistCourse(learning, admin.id, "pdf", KB_FILE);
  await prisma.course.update({
    where: { id: course.id },
    data: { business: BUSINESS, published: true },
  });
  await saveSource(course.id, kbText);

  // —— 实操宝典：操作手册写为流程 ——
  const manualBuffer = await readFile(path.join(BOOK_DIR, MANUAL_FILE));
  const manualText = await extractText(MANUAL_FILE, manualBuffer);
  await saveSource(`${course.id}-manual`, manualText);

  for (const [index, flow] of MANUAL_FLOWS.entries()) {
    await prisma.manualFlow.create({
      data: {
        courseId: course.id,
        order: index + 1,
        title: flow.title,
        goal: flow.goal,
        steps: {
          create: flow.steps.map((step, stepIndex) => ({
            order: stepIndex + 1,
            kind: stepIndex === flow.steps.length - 1 ? "end" : "step",
            actor: step.actor,
            title: step.title,
            detail: step.detail.join("\n"),
          })),
        },
      },
    });
  }

  const flows = await prisma.manualFlow.count({ where: { courseId: course.id } });
  const chapters = await prisma.chapter.count({ where: { courseId: course.id } });
  console.log(
    `✅ 线上保理示例就绪：课程 ${course.id}，学习关卡 ${chapters} 个，实操流程 ${flows} 条`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
