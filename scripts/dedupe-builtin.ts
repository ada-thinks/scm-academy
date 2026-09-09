import { prisma } from "../src/lib/prisma";

async function main() {
  const builtins = await prisma.course.findMany({
    where: { sourceType: "builtin" },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, sourceName: true, createdAt: true },
  });
  const groups = new Map<string, typeof builtins>();
  for (const c of builtins) {
    const key = c.sourceName || c.title;
    groups.set(key, [...(groups.get(key) || []), c]);
  }
  for (const [key, list] of groups) {
    if (list.length <= 1) {
      console.log(`✔ ${key}：仅 1 份（保留 ${list[0].id}）`);
      continue;
    }
    const [keep, ...dups] = list;
    console.log(`\n⚠ ${key}：共 ${list.length} 份`);
    console.log(`  保留最早：${keep.id} (${keep.createdAt.toISOString()})`);
    for (const dup of dups) {
      await prisma.course.delete({ where: { id: dup.id } });
      console.log(`  🗑️ 删除：${dup.id} (${dup.createdAt.toISOString()})`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
