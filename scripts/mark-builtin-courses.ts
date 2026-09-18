/**
 * 将 book/ 六门业务课在库中标记为内置课程（sourceType=builtin + 稳定 sourceName）
 * 用法：npm run mark:builtin
 */
import { prisma } from "../src/lib/prisma";

const SPECS = [
  { business: "线上保理", title: "线上保理业务知识库" },
  { business: "信用证", title: "信用证业务知识库" },
  { business: "票据", title: "票据业务知识库" },
  { business: "凭证", title: "凭证业务知识库" },
  { business: "订单融资", title: "订单融资业务知识库" },
  { business: "经销商", title: "经销商业务知识库" },
] as const;

async function main() {
  for (const spec of SPECS) {
    const sourceName = `内置教材：${spec.title}`;
    const course = await prisma.course.findFirst({
      where: {
        OR: [
          { sourceName },
          { title: spec.title },
          { business: spec.business, title: { contains: "知识库" } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    if (!course) {
      console.warn(`⚠️ 未找到：${spec.title}（business=${spec.business}）`);
      continue;
    }

    await prisma.course.update({
      where: { id: course.id },
      data: {
        sourceType: "builtin",
        sourceName,
        business: spec.business,
        published: true,
        status: "ready",
      },
    });
    console.log(`✅ 内置：${spec.title} → id=${course.id}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
