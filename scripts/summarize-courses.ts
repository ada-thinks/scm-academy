import { prisma } from "../src/lib/prisma";

async function main() {
  const courses = await prisma.course.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      chapters: {
        include: {
          _count: { select: { questions: true, cases: true } },
        },
      },
    },
  });
  for (const c of courses) {
    console.log(`\n=== ${c.title} [${c.id}] type=${c.sourceType} src=${c.sourceName || "-"} by=${c.createdById || "-"}`);
    for (const ch of c.chapters) {
      console.log(`  - [${ch.order}] ${ch.title} | Q:${ch._count.questions} case:${ch._count.cases} mind:${(ch.mindmapJson || "").length > 2} notes:${(ch.notesMd || "").length}chars`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
