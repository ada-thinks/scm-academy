import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const users = await prisma.user.findMany({ select: { username: true, role: true, xp: true } });
  const courses = await prisma.course.findMany({
    select: { id: true, title: true, sourceType: true, _count: { select: { chapters: true } } },
  });
  console.log(JSON.stringify({ users, courses }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
